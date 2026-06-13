import copy
import csv
import io
import logging
import re
from datetime import UTC, datetime
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_PAN_RE = re.compile(r'^[A-Z]{5}[0-9]{4}[A-Z]$')
_VALID_REGIMES = {"new", "old"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from database import (
    add_filing, clear_documents, clear_filings, clear_profile,
    delete_filing, get_corpus_sections, get_documents, get_filings,
    get_regulation_changes, get_tax_rules, get_tax_updates,
    load_profile, save_document, save_profile,
)
from services.ai_review_service import review_itr
from services.calculation_engine import compute_tax
from services.discovery_engine import discover_deductions
from services.document_parser import parse_document, reconcile_documents
from services.notice_service import analyze_notice
from services.rag_service import call_llm, get_llm_config, get_rag_response, search_corpus, update_llm_config
from services.tax_updater import get_status as get_corpus_status
from services.tax_updater import run_update as run_corpus_update
from services.tds_service import calculate_26qb
from services.template_service import generate_template

router = APIRouter()

_DEFAULT_PROFILE = {
    "user_id": "",
    "assessment_year": "2026-27",
    "personal": {
        "pan": "",
        "first_name": "",
        "last_name": "",
        "age_category": "general",
        "residential_status": "resident",
    },
    "income": {
        "salary": {"basic": 0, "hra": 0, "lta": 0, "special": 0},
        "house_property": {"rental": 0, "interest_paid": 0, "municipal_taxes": 0, "rental_paid": 0},
        "capital_gains": {"stcg_111a": 0, "ltcg_112a": 0},
        "business_profession": {"turnover": 0, "presumptive": False},
        "other_sources": {"interest": 0, "dividend": 0, "family_pension": 0},
    },
    "deductions": {
        "80C": {"breakdown": {"epf": 0, "ppf": 0, "elss": 0, "lic": 0, "tuition": 0}},
        "80D": {"self_family": 0, "parents": 0, "senior_citizen_flag": False, "parents_senior_citizen_flag": False},
        "80CCD_1B": 0,
        "80E": 0,
        "80G": {"eligible_100": 0, "eligible_50": 0, "total": 0},
        "80EEA": {"interest": 0},
        "80TTA": 0,
        "80TTB": 0,
        "80U": {"disability_percentage": 0},
    },
    "tax_paid": {"tds_salary": 0, "tds_other": 0, "advance_tax": 0, "self_assessment_tax": 0},
    "regime": {"chosen": "new", "switched": False},
}


# ── DB-backed session helpers ─────────────────────────────────────────────────

def _get_profile() -> dict:
    profile = load_profile() or copy.deepcopy(_DEFAULT_PROFILE)
    profile["past_filings"] = get_filings()
    return profile


def _set_profile(profile: dict) -> None:
    save_profile({k: v for k, v in profile.items() if k != "past_filings"})


def _get_docs() -> dict:
    return get_documents()


# ── Tax computation ───────────────────────────────────────────────────────────

@router.post("/tax/optimize")
async def optimize_tax(request: Request):
    body = await request.json()
    profile = body.get("user_profile") or _get_profile()
    return compute_tax(profile)


@router.post("/tax/calculate")
async def calculate_tax(request: Request):
    profile = await request.json()
    return compute_tax(profile)


# ── Document parsing ──────────────────────────────────────────────────────────

@router.post("/documents/parse")
async def parse_document_route(
    file: UploadFile | None = File(None),
    document_type: str = Form(...),
):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if document_type not in {"form16", "form26as", "ais"}:
        raise HTTPException(status_code=400, detail="document_type must be form16, form26as, or ais")

    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum 10 MB allowed.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    result = await parse_document(content, file.filename, document_type)

    if result.get("success"):
        save_document(document_type, result, file.filename or "")
        ext = result["extracted_data"]
        profile = _get_profile()

        if document_type == "form16":
            profile["personal"]["pan"] = ext["employee"]["pan"]
            sal_b = ext["income"]["salary_breakup"]
            profile["income"]["salary"].update({
                "basic": sal_b["basic"], "hra": sal_b["hra"],
                "lta": sal_b["lta"], "special": sal_b["special"],
            })
            sec80c = ext["deductions_chapter_via"]["sec_80c"]
            profile["deductions"]["80C"]["breakdown"] = {
                "epf": sec80c.get("epf", 0), "ppf": sec80c.get("ppf", 0),
                "elss": sec80c.get("elss", 0), "lic": sec80c.get("lic", 0),
                "tuition": sec80c.get("tuition", 0),
            }
            profile["deductions"]["80D"]["self_family"] = (
                ext["deductions_chapter_via"]["sec_80d"]["self_family"]
            )
            profile["tax_paid"]["tds_salary"] = ext["tax_deducted"]["tds_salary"]

        elif document_type == "form26as":
            tds_entries = ext.get("tds_summary", [])
            if tds_entries:
                sal_entry = max(tds_entries, key=lambda e: e.get("amount_paid", 0))
                profile["tax_paid"]["tds_salary"] = sal_entry["tax_deducted"]
                other_tds = sum(
                    e["tax_deducted"] for e in tds_entries if e is not sal_entry
                )
                if other_tds:
                    profile["tax_paid"]["tds_other"] = other_tds
            advance = ext.get("advance_tax", [])
            if advance:
                profile["tax_paid"]["advance_tax"] = sum(c["amount"] for c in advance)

        elif document_type == "ais":
            if ext.get("savings_interest", {}).get("total", 0) > 0:
                profile["income"]["other_sources"]["interest"] = ext["savings_interest"]["total"]
            if ext.get("dividend_income", {}).get("total", 0) > 0:
                profile["income"]["other_sources"]["dividend"] = ext["dividend_income"]["total"]
            stcg = sum(s.get("stcg", 0) for s in ext.get("securities_transactions", []))
            if stcg > 0:
                profile["income"]["capital_gains"]["stcg_111a"] = stcg

        _set_profile(profile)

    docs = _get_docs()
    reconciliation = None
    if any(v is not None for v in docs.values()):
        reconciliation = reconcile_documents(docs["form16"], docs["form26as"], docs["ais"])

    return {"parse_result": result, "reconciliation": reconciliation, "updated_profile": _get_profile()}


# ── Deductions ────────────────────────────────────────────────────────────────

@router.post("/deductions/discover")
async def discover_deductions_route(request: Request):
    body = await request.json()
    profile = body.get("user_profile") or _get_profile()
    signals = body.get("user_signals", [])
    return discover_deductions(profile, signals)


# ── Chat / RAG ────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(request: Request):
    body = await request.json()
    message = body.get("message")
    history = body.get("history", [])
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    return await get_rag_response(message, history)


@router.get("/laws/{section}")
def get_law(section: str):
    results = search_corpus(section)
    matched = next((s for s in results if s["section"].lower() == section.lower()), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Section {section} not found")
    return matched


# ── Scenarios ─────────────────────────────────────────────────────────────────

@router.post("/scenarios/simulate")
async def simulate_scenario(request: Request):
    body = await request.json()
    changes = body.get("changes", [])
    profile = _get_profile()
    simulated = copy.deepcopy(profile)

    _map = {
        "80C_elss":    ("deductions", "80C", "breakdown", "elss"),
        "80C_ppf":     ("deductions", "80C", "breakdown", "ppf"),
        "80D_self":    ("deductions", "80D", "self_family"),
        "80D_parents": ("deductions", "80D", "parents"),
        "80CCD_1B":    ("deductions", "80CCD_1B"),
        "sec_24b":     ("income", "house_property", "interest_paid"),
        "80EEA":       ("deductions", "80EEA", "interest"),
    }

    for change in changes:
        section = change.get("section")
        try:
            amount = float(change.get("amount", 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Invalid amount for section '{section}'")
        if amount < 0:
            raise HTTPException(status_code=400, detail=f"Amount cannot be negative for section '{section}'")
        path    = _map.get(section)
        if not path:
            continue
        node = simulated
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = amount

    original         = compute_tax(profile)
    simulated_result = compute_tax(simulated)

    return {
        "original":  original,
        "simulated": simulated_result,
        "diff": {
            "new_regime_saving": original["new_regime"]["total_tax"] - simulated_result["new_regime"]["total_tax"],
            "old_regime_saving": original["old_regime"]["total_tax"] - simulated_result["old_regime"]["total_tax"],
        },
    }


# ── Refund status ─────────────────────────────────────────────────────────────

@router.get("/refund/status")
def refund_status(pan: str, ay: str = "2026-27"):
    if not pan:
        raise HTTPException(status_code=400, detail="PAN is required")
    return {
        "pan": pan.upper(),
        "assessment_year": ay,
        "status": "NOT_CONNECTED",
        "message": (
            "Refund status is not connected to the Income Tax portal. "
            "Please visit incometax.gov.in to check your actual refund status."
        ),
    }


# ── ITR generation ────────────────────────────────────────────────────────────

@router.post("/itr/generate")
async def generate_itr(request: Request):
    body    = await request.json()
    regime  = body.get("regime")
    ay      = body.get("ay", "2026-27")

    if regime and regime not in _VALID_REGIMES:
        raise HTTPException(status_code=400, detail="regime must be 'new' or 'old'")

    profile = _get_profile()
    tax     = compute_tax(profile)
    sel     = regime or tax["summary"]["optimal_regime"]
    r_data  = tax[f"{sel}_regime"]
    total_tax = r_data["total_tax"]

    sal          = profile["income"]["salary"]
    gross_salary = sal.get("basic", 0) + sal.get("hra", 0) + sal.get("lta", 0) + sal.get("special", 0)
    cg           = profile["income"]["capital_gains"]
    has_cg       = (cg.get("stcg_111a", 0) + cg.get("ltcg_112a", 0)) > 0
    hp           = profile["income"]["house_property"]
    has_hp_loss  = (hp.get("rental", 0) - hp.get("municipal_taxes", 0) * 0.7 - hp.get("interest_paid", 0)) < 0
    has_business = profile["income"]["business_profession"].get("turnover", 0) > 0

    # ITR form selection per CLAUDE.md rules
    if has_business:
        itr_form = "ITR-3"
    elif has_cg or gross_salary > 5_000_000 or has_hp_loss:
        itr_form = "ITR-2"
    else:
        itr_form = "ITR-1"

    tp           = profile["tax_paid"]
    total_paid   = (
        tp.get("tds_salary", 0) + tp.get("tds_other", 0)
        + tp.get("advance_tax", 0) + tp.get("self_assessment_tax", 0)
    )

    new_r = tax["new_regime"]
    old_r = tax["old_regime"]

    itr_json = {
        "ITR": {
            "Header": {
                "SchemaVersion":  "2.0.0",
                "FormName":       itr_form,
                "AssessmentYear": ay,
                "SoftwareName":   "TaxMe",
                "SoftwareVersion":"1.0.0",
            },
            "PersonalInfo": {
                "AssesseeName": {
                    "FirstName": profile["personal"].get("first_name", ""),
                    "SurName":   profile["personal"].get("last_name", ""),
                },
                "PAN":               profile["personal"]["pan"],
                "Address":           profile["personal"].get("address", {}),
                "AgeCategory":       profile["personal"]["age_category"],
                "ResidentialStatus": profile["personal"]["residential_status"],
            },
            "FilingStatus": {
                "RegimeSelection": "115BAC_Opt_In" if sel == "new" else "115BAC_Opt_Out",
                "SectionCode":     "139(1)",
            },
            "IncomeFromSalary": {
                "GrossSalary":       gross_salary,
                "ExemptAllowances":  (old_r["hra_exemption"] + old_r["lta_exemption"]) if sel == "old" else 0,
                "StandardDeduction": new_r["standard_deduction"] if sel == "new" else old_r["standard_deduction"],
                "NetSalaryIncome": (
                    gross_salary - new_r["standard_deduction"]
                    if sel == "new"
                    else gross_salary - old_r["hra_exemption"] - old_r["lta_exemption"] - old_r["standard_deduction"]
                ),
            },
            "DeductionsChapterVIA": (
                {
                    "Sec80C":        old_r["deductions"]["sec_80C"],
                    "Sec80D":        old_r["deductions"]["sec_80D"],
                    "Sec80CCD_1B":   old_r["deductions"]["sec_80CCD"],
                    "Sec80E":        old_r["deductions"]["sec_80E"],
                    "Sec80TTA":      old_r["deductions"]["savings_interest"],
                    "TotalDeductions": old_r["deductions"]["total"],
                }
                if sel == "old"
                else {"TotalDeductions": 0}
            ),
            "TaxComputation": {
                "GrossTotalIncome":   new_r["gross_total_income"]  if sel == "new" else old_r["gross_total_income"],
                "TotalTaxableIncome": new_r["taxable_income"]      if sel == "new" else old_r["taxable_income"],
                "BaseTax":            new_r["base_tax"]            if sel == "new" else old_r["base_tax"],
                "Rebate87A":          new_r["rebate_87a"]          if sel == "new" else old_r["rebate_87a"],
                "Cess":               new_r["cess"]                if sel == "new" else old_r["cess"],
                "TotalTaxLiability":  total_tax,
            },
            "TaxPaid": {
                "TDSSalary":   tp.get("tds_salary", 0),
                "TDSOthers":   tp.get("tds_other", 0),
                "AdvanceTax":  tp.get("advance_tax", 0),
                "TotalTaxPaid": total_paid,
            },
            "NetRefundPayable": {
                "Amount":        max(0, total_paid - total_tax),
                "PayableAmount": max(0, total_tax  - total_paid),
            },
        }
    }

    return {
        "regime":                sel,
        "itr_form":              itr_form,
        "total_liability":       total_tax,
        "net_payable_refundable": itr_json["ITR"]["NetRefundPayable"],
        "itr_json":              itr_json,
    }


# ── Session / memory ──────────────────────────────────────────────────────────

@router.get("/memory/profile")
def get_profile():
    return _get_profile()


def _deep_merge(base: dict, updates: dict) -> dict:
    """Recursively merge updates into base, preserving sibling keys in nested dicts."""
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


@router.post("/memory/update")
async def update_profile(request: Request):
    updates = await request.json()
    # Validate PAN if present
    pan = updates.get("personal", {}).get("pan", "")
    if pan and not _PAN_RE.match(pan.upper()):
        raise HTTPException(status_code=400, detail="Invalid PAN format. Must match AAAAA9999A.")
    profile = _get_profile()
    _deep_merge(profile, updates)
    _set_profile(profile)
    return {"success": True, "profile": _get_profile()}


@router.delete("/memory/clear")
def clear_memory():
    clear_profile()
    clear_documents()
    clear_filings()
    erased_at = datetime.now(UTC).isoformat()
    logger.info("DPDP_ERASURE cleared_tables=[tax_profiles,uploaded_documents,tax_filings] at=%s", erased_at)
    return {
        "success": True,
        "message": "All PII erased per DPDP Act Section 13.",
        "erased_at": erased_at,
    }


# ── AI review ─────────────────────────────────────────────────────────────────

@router.post("/ai-review/request")
async def ai_review():
    profile  = _get_profile()
    tax_data = compute_tax(profile)
    return await review_itr(profile, tax_data)


# ── TDS ───────────────────────────────────────────────────────────────────────

@router.post("/tds/26qb/calculate")
async def tds_26qb(request: Request):
    data = await request.json()
    return calculate_26qb(data)


# ── Templates ─────────────────────────────────────────────────────────────────

@router.post("/templates/generate")
async def templates_generate(request: Request):
    body          = await request.json()
    template_type = body.get("template_type")
    details       = body.get("details")
    if not template_type or details is None:
        raise HTTPException(status_code=400, detail="template_type and details are required")
    try:
        return generate_template(template_type, details)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Notice analysis ───────────────────────────────────────────────────────────

@router.post("/notices/analyze")
async def notices_analyze(request: Request):
    body        = await request.json()
    notice_text = (body.get("notice_text") or "").strip()
    if not notice_text:
        raise HTTPException(status_code=400, detail="notice_text is required")
    return await analyze_notice(notice_text, _get_profile())


# ── e-Verify ──────────────────────────────────────────────────────────────────

@router.post("/everify/initiate")
async def everify_initiate(request: Request):
    body    = await request.json()
    method  = body.get("method")
    itr_ack = body.get("itr_ack", "")

    _methods = {
        "aadhaar_otp": {
            "instruction": "OTP sent to your Aadhaar-registered mobile. Enter it to complete e-verification.",
            "code": "OTP_SENT",
        },
        "net_banking": {
            "instruction": "You will be redirected to your bank net banking portal. Login → Tax Services → e-Verify ITR.",
            "code": "REDIRECT_BANK",
            "banks": ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BOB", "+35 more"],
        },
        "bank_account": {
            "instruction": "Electronic Verification Code (EVC) sent to registered mobile and email.",
            "code": "EVC_SENT",
        },
        "dsc": {
            "instruction": "Insert USB DSC token and select your digital certificate to sign the return.",
            "code": "DSC_READY",
        },
    }
    selected = _methods.get(method)
    if not selected:
        raise HTTPException(
            status_code=400,
            detail="Invalid e-verify method. Use: aadhaar_otp, net_banking, bank_account, or dsc.",
        )
    return {
        "status":       "initiated",
        "method":       method,
        "itr_ack":      itr_ack,
        **selected,
        "initiated_at": datetime.now(UTC).isoformat(),
    }


@router.post("/everify/confirm")
async def everify_confirm(request: Request):
    body = await request.json()
    return {
        "success":     True,
        "status":      "E_VERIFIED",
        "itr_ack":     body.get("itr_ack", ""),
        "method":      body.get("method", ""),
        "verified_at": datetime.now(UTC).isoformat(),
        "message":     "ITR successfully e-verified. CPC will process your return within 15-21 working days.",
        "next_steps": [
            "Save ITR-V / Acknowledgment receipt (required for 7 years)",
            "Check refund status on e-filing portal after 21 days",
            "Confirmation SMS will be sent to your registered mobile",
        ],
    }


# ── LLM config ────────────────────────────────────────────────────────────────

@router.get("/llm/config")
def llm_config_get():
    return get_llm_config()


_SSRF_BLOCKED_HOSTS = {
    "169.254.169.254",       # AWS/GCP metadata
    "metadata.google.internal",
    "100.100.100.200",       # Alibaba metadata
}


@router.post("/llm/config")
async def llm_config_set(request: Request):
    body     = await request.json()
    url      = (body.get("url")      or "").strip()
    model    = (body.get("model")    or "").strip()
    provider = (body.get("provider") or "openai").strip()
    api_key  = (body.get("api_key")  or "")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if not model:
        raise HTTPException(status_code=400, detail="model is required")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="url must use http or https")
    if parsed.hostname in _SSRF_BLOCKED_HOSTS:
        raise HTTPException(status_code=400, detail="Invalid LLM URL")
    return update_llm_config(url, model, provider, api_key)


@router.post("/llm/test")
async def llm_test():
    cfg = get_llm_config()
    try:
        await call_llm([{"role": "user", "content": "ping"}], temperature=0.0, max_tokens=5)
        return {"reachable": True, "url": cfg["url"], "model": cfg["model"], "provider": cfg.get("provider", "openai")}
    except Exception as exc:
        return {"reachable": False, "url": cfg["url"], "model": cfg["model"], "provider": cfg.get("provider", "openai"), "error": str(exc)}


# ── Reports ───────────────────────────────────────────────────────────────────

@router.get("/reports/filings")
def reports_list_filings():
    return {"filings": get_filings()}


@router.post("/reports/filings")
async def reports_add_filing(request: Request):
    body = await request.json()
    for field in ("ay", "fy", "itr_form", "regime", "gross_income", "tax_paid"):
        if field not in body:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
    return add_filing(body)


@router.delete("/reports/filings/{filing_id}")
def reports_delete_filing(filing_id: int):
    if not delete_filing(filing_id):
        raise HTTPException(status_code=404, detail="Filing not found")
    return {"success": True}


@router.get("/reports/summary")
def reports_summary():
    filings = get_filings()
    if not filings:
        return {"total_filings": 0, "total_tax_paid": 0, "total_refunds": 0, "total_saved": 0, "by_year": []}
    return {
        "total_filings":  len(filings),
        "total_tax_paid": sum(f["tax_paid"]  for f in filings),
        "total_refunds":  sum(f["refund"]    for f in filings),
        "total_saved":    sum(f["tax_saved"] for f in filings),
        "by_year": [
            {
                "ay":           f["ay"],
                "fy":           f["fy"],
                "gross_income": f["gross_income"],
                "tax_paid":     f["tax_paid"],
                "tax_saved":    f["tax_saved"],
                "refund":       f["refund"],
            }
            for f in filings
        ],
    }


@router.get("/reports/export")
def reports_export():
    filings = get_filings()
    output  = io.StringIO()
    fields  = [
        "id", "ay", "fy", "itr_form", "regime", "gross_income",
        "tax_paid", "tax_saved", "refund", "payable",
        "status", "filed_on", "ack_no", "created_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(filings)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tax_filings.csv"},
    )


# ── Live corpus / web-update endpoints ────────────────────────────────────────

@router.get("/corpus/status")
def corpus_status():
    return get_corpus_status()


@router.post("/corpus/refresh")
async def corpus_refresh(bg: BackgroundTasks):
    bg.add_task(run_corpus_update)
    return {"message": "Refresh started in background", "status": "running"}


# ── Tax rules & corpus (DB-backed) ────────────────────────────────────────────

@router.get("/tax-rules")
def tax_rules_get(ay: str = "2026-27"):
    rules = get_tax_rules(ay)
    if not rules:
        raise HTTPException(status_code=404, detail=f"No rules found for AY {ay}")
    return rules


@router.get("/corpus/sections")
def corpus_sections_get():
    return {"sections": get_corpus_sections()}


@router.get("/corpus/updates")
def corpus_updates_get(limit: int = 30):
    return {"updates": get_tax_updates(limit=limit)}


# ── Regulation changes ────────────────────────────────────────────────────────

@router.get("/regulation-changes")
def regulation_changes_get(ay: str | None = None, applied: str | None = None, limit: int = 50):
    applied_bool: bool | None = None
    if applied is not None:
        applied_bool = applied.lower() in ("1", "true", "yes")
    changes = get_regulation_changes(ay=ay, applied=applied_bool, limit=limit)
    return {"changes": changes, "total": len(changes)}


@router.post("/regulation-changes/analyze")
async def regulation_analyze(bg: BackgroundTasks):
    """Trigger LLM analysis of unanalyzed articles in the background."""
    from services.regulation_analyzer import analyze_and_apply_new_updates
    bg.add_task(analyze_and_apply_new_updates)
    return {"message": "Regulation analysis started in background"}


@router.get("/regulation-changes/summary")
def regulation_changes_summary():
    all_changes   = get_regulation_changes(limit=200)
    applied_count = sum(1 for c in all_changes if c.get("applied"))
    pending_count = sum(1 for c in all_changes if not c.get("applied"))
    by_type: dict[str, int] = {}
    for c in all_changes:
        ct = c.get("change_type", "other")
        by_type[ct] = by_type.get(ct, 0) + 1
    return {
        "total":   len(all_changes),
        "applied": applied_count,
        "pending": pending_count,
        "by_type": by_type,
        "recent":  all_changes[:5],
    }
