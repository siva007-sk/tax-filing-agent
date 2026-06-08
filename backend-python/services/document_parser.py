import io
import re


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_amount(text: str) -> int:
    """Convert Indian-format number string (e.g. '1,20,000' or '1,20,000.00') to int."""
    cleaned = re.sub(r"[,\s`₹]", "", text.strip())
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return 0


def _extract_pdf_text(file_buffer: bytes) -> str | None:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_buffer))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception:
        return None


def _find_amount(pattern: str, text: str, flags: int = re.IGNORECASE) -> int:
    """Return the first number matched by capture group 1, or 0."""
    m = re.search(pattern, text, flags)
    return _parse_amount(m.group(1)) if m else 0


def _find_string(pattern: str, text: str, flags: int = re.IGNORECASE) -> str:
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else ""


def _find_rupee_amount(label: str, text: str, flags: int = re.IGNORECASE) -> int:
    """
    Match amounts written as  'Label ... ` 123456.00'  (backtick-style rupee symbol
    used in many digitally-signed Form 16 PDFs).  Requires the backtick so we never
    accidentally match a digit that appears inside the label text itself.
    """
    pattern = re.escape(label) + r"[^`\n]*`\s*([\d,]+(?:\.\d+)?)"
    return _find_amount(pattern, text, flags)


# ── Form 16 parser ────────────────────────────────────────────────────────────

def _parse_form16(text: str) -> dict:
    # ── Identifiers ───────────────────────────────────────────────────────────
    # PAN appears inline: "PAN of Employee: CNTPD0405J Assessment Year: ..."
    pan = _find_string(r"PAN of (?:the )?Employee[^:\n]*:\s*([A-Z]{5}[0-9]{4}[A-Z])", text)
    if not pan:
        # Multi-line variant: "PAN of the\nEmployee/...\nCNTPD0405J"
        pan = _find_string(
            r"PAN of (?:the )?Employee[^\n]*\n(?:[^\n]*\n)*?([A-Z]{5}[0-9]{4}[A-Z])", text
        )

    tan = _find_string(r"TAN of (?:the )?(?:Deductor|Employer)[:\s]+([A-Z]{4}[0-9]{5}[A-Z])", text)
    if not tan:
        tan = _find_string(r"TAN of (?:the )?(?:Deductor|Employer)[^\n]*\n([A-Z]{4}[0-9]{5}[A-Z])", text)

    employer_name = _find_string(r"Name and address of the Employer[^\n]*\n([^\n]+)", text)
    employee_name = _find_string(r"Employee Name\s*:\s*([^\n]+)", text)
    if not employee_name:
        employee_name = _find_string(r"Name and address of the Employee[^\n]*\n([^\n]+)", text)

    ay = _find_string(r"Assessment Year[:\s]+(\d{4}-\d{2,4})", text)
    if ay:
        ay = f"{ay[:4]}-{ay[-2:]}"  # normalise "2025-2026" → "2025-26"
    else:
        ay = "2026-27"

    # ── Salary figures ────────────────────────────────────────────────────────
    # Primary: Annexure format  "Total Salary as per provisions ... ` 2384076.00"
    gross_salary = _find_rupee_amount("Total Salary as per provisions", text)
    if not gross_salary:
        # Part B format: "Salary as per provisions contained in section 17(1)(a) 2384076.00"
        gross_salary = _find_amount(
            r"Salary as per provisions contained in section 17\(1\)\s*\(a\)\s+([\d,]+)", text
        )

    # Annexure breakdown — all use backtick amounts
    basic   = _find_rupee_amount("Basic", text)
    hra     = _find_rupee_amount("House Rent Allowance", text)
    special = _find_rupee_amount("Special Allowance", text)

    # LTA — try named allowance first, then Conveyance
    lta = _find_rupee_amount("Leave Travel", text)
    if not lta:
        lta = _find_rupee_amount("Conveyance Allowance", text)

    # Standard deduction — Part B puts the amount on the "(a)" row BEFORE the label
    # Pattern: "Less: Deductions under section 16 ... (a) 75000.00"
    std_deduction = _find_amount(
        r"Deductions under section 16[^(]*\(a\)\s+([\d,]+)", text, re.DOTALL | re.IGNORECASE
    )
    if not std_deduction:
        std_deduction = _find_amount(r"Standard deduction[^\d\n]*`\s*([\d,]+)", text)
    if not std_deduction:
        std_deduction = 75_000  # FY 2025-26 new-regime default

    professional_tax = _find_amount(
        r"Tax on employment under section 16\(iii\)\s+([\d,]+)", text
    )

    # ── TDS ──────────────────────────────────────────────────────────────────
    # Annexure: "Current Employer ` 398034.00"  (backtick prevents matching
    # "total amount of salary received from current employer [1(d)...]")
    tds = _find_rupee_amount("Current Employer", text)
    if not tds:
        # Part B line 21: "Net tax payable (17-18-19-20)21. 398034.00"
        tds = _find_amount(
            r"Net tax payable\s*\([^)]+\)\s*\d+\.\s*([\d,]+)", text
        )
    if not tds:
        # Part A total: "Total (Rs.) 398034.00 398034.00 ..."
        tds = _find_amount(r"Total\s*\(Rs\.\)\s*([\d,]+(?:\.\d+)?)", text)

    # ── Chapter VI-A ─────────────────────────────────────────────────────────
    # 80C total — full label avoids matching "80CCC" digits; amount is on its
    # own line after "(c)\n(g)\n" in the Part B table layout.
    sec80c_total = _find_amount(
        r"Total deduction under section 80C, 80CCC and 80CCD\(1\)[^\n]*\n(?:[^\d\n]*\n)*([\d,]+(?:\.\d+)?)",
        text
    )
    # Individual 80C components from Annexure (backtick amounts)
    epf  = _find_rupee_amount("Provident Fund", text) or _find_rupee_amount("EPF", text)
    ppf  = _find_rupee_amount("PPF", text)
    elss = _find_rupee_amount("ELSS", text) or _find_rupee_amount("Equity Linked Saving", text)
    lic  = _find_rupee_amount("Life Insurance", text)

    # Only use 80C total as EPF stand-in when it's clearly non-zero
    if sec80c_total and sec80c_total > 100 and not (epf or ppf or elss or lic):
        epf = sec80c_total

    # 80D — the Part B layout places "80D" on the line immediately after the
    # label, so we skip up to 3 arbitrary lines then require a decimal to
    # avoid capturing the section number itself.
    sec80d_self = _find_rupee_amount("Health Insurance", text)
    if not sec80d_self:
        sec80d_self = _find_amount(
            r"health insurance premia[^\n]*\n(?:[^\n]*\n){0,3}([\d,]+\.\d+)",
            text
        )

    # ── Validate ─────────────────────────────────────────────────────────────
    if not gross_salary and not tds:
        raise ValueError(
            "Could not extract salary or TDS figures from the document. "
            "Please ensure you uploaded a text-based (not scanned) Form 16 PDF, "
            "or enter values manually."
        )

    return {
        "employer": {
            "name": employer_name or "Unknown Employer",
            "tan": tan or "Unknown",
            "address": "",
        },
        "employee": {
            "pan": pan or "Unknown",
            "name": employee_name or "Unknown",
            "assessment_year": ay,
            "period": f"01-Apr-{int(ay[:4]) - 1} to 31-Mar-{ay[:4]}",
        },
        "income": {
            "salary_breakup": {
                "basic":        basic,
                "hra":          hra,
                "lta":          lta,
                "special":      special,
                "gross_salary": gross_salary,
            },
            "deductions_sec16": {
                "standard_deduction": std_deduction,
                "professional_tax":   professional_tax,
            },
        },
        "deductions_chapter_via": {
            "sec_80c": {
                "epf":   epf,
                "ppf":   ppf,
                "elss":  elss,
                "lic":   lic,
                "total": sec80c_total or (epf + ppf + elss + lic),
            },
            "sec_80d": {"self_family": sec80d_self, "parents": 0},
        },
        "tax_deducted": {"tds_salary": tds, "tds_deposited": tds},
    }


# ── Form 26AS parser ──────────────────────────────────────────────────────────

def _parse_form26as(text: str) -> dict:
    pan = _find_string(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
    ay  = _find_string(r"Assessment Year[:\s]+(\d{4}-\d{2,4})", text)

    tds_summary = []
    block_pattern = re.compile(
        r"([A-Z][^\n]{5,60})\s+([A-Z]{4}[0-9]{5}[A-Z])\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)",
        re.IGNORECASE,
    )
    for m in block_pattern.finditer(text):
        tds_summary.append({
            "employer_name": m.group(1).strip(),
            "tan":           m.group(2),
            "amount_paid":   _parse_amount(m.group(3)),
            "tax_deducted":  _parse_amount(m.group(4)),
            "tax_deposited": _parse_amount(m.group(5)),
        })

    advance = []
    for m in re.finditer(r"(\d{7})\s+(\d{2}-\w{3}-\d{4})\s+(\d+)\s+([\d,]+)", text):
        advance.append({
            "bsr_code":        m.group(1),
            "date_of_deposit": m.group(2),
            "challan_no":      m.group(3),
            "amount":          _parse_amount(m.group(4)),
        })

    if not tds_summary and not pan:
        raise ValueError(
            "Could not extract TDS entries from the document. "
            "Please ensure you uploaded a text-based Form 26AS PDF."
        )

    return {
        "pan":             pan or "Unknown",
        "assessment_year": ay or "2026-27",
        "tds_summary":     tds_summary,
        "advance_tax":     advance,
        "self_assessment_tax": [],
    }


# ── AIS parser ────────────────────────────────────────────────────────────────

def _parse_ais(text: str) -> dict:
    pan           = _find_string(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
    ay            = _find_string(r"Assessment Year[:\s]+(\d{4}-\d{2,4})", text)
    gross_salary  = _find_amount(r"(?:salary|gross\s+salary)[^\d]*([\d,]+)", text)
    savings_int   = _find_amount(r"(?:savings?\s+(?:account\s+)?interest|interest\s+on\s+savings)[^\d]*([\d,]+)", text)
    dividend      = _find_amount(r"dividend[^\d]*([\d,]+)", text)
    stcg          = _find_amount(r"(?:short\s+term\s+capital\s+gain|stcg)[^\d]*([\d,]+)", text)
    ltcg          = _find_amount(r"(?:long\s+term\s+capital\s+gain|ltcg)[^\d]*([\d,]+)", text)

    securities = []
    if stcg:
        securities.append({"type": "Sale of Equity Shares / Mutual Funds",
                           "description": "From AIS", "sale_value": 0,
                           "cost_of_acquisition": 0, "stcg": stcg})
    if ltcg:
        securities.append({"type": "Sale of Equity Shares / Mutual Funds",
                           "description": "From AIS", "sale_value": 0,
                           "cost_of_acquisition": 0, "ltcg": ltcg})

    return {
        "pan":             pan or "Unknown",
        "assessment_year": ay or "2026-27",
        "salary":          {"gross_amount": gross_salary, "employers": []},
        "savings_interest":{"banks": [], "total": savings_int},
        "dividend_income": {"total": dividend, "issuers": []},
        "securities_transactions": securities,
    }


# ── Public entry point ────────────────────────────────────────────────────────

async def parse_document(file_buffer: bytes | None, original_name: str, document_type: str) -> dict:
    name = (original_name or "").lower()

    is_form16  = document_type == "form16"  or "form16" in name or "form_16" in name
    is_form26as= document_type == "form26as" or "26as" in name
    is_ais     = document_type == "ais"     or "ais" in name or "annual_information" in name

    if not file_buffer:
        return {"success": False, "error": "No file content provided."}

    # Try PDF first, then plain-text fallback
    text = _extract_pdf_text(file_buffer)
    if not text or len(text.strip()) < 50:
        try:
            text = file_buffer.decode("utf-8", errors="ignore")
        except Exception:
            text = None

    if not text or len(text.strip()) < 50:
        return {
            "success": False,
            "error": (
                "Could not extract readable text from the uploaded file. "
                "If this is a scanned PDF, please use a text-based Form 16 "
                "or enter values manually."
            ),
        }

    try:
        if is_form16:
            extracted = _parse_form16(text)
            return {"success": True, "document_type": "Form 16", "extracted_data": extracted}
        if is_form26as:
            extracted = _parse_form26as(text)
            return {"success": True, "document_type": "Form 26AS", "extracted_data": extracted}
        if is_ais:
            extracted = _parse_ais(text)
            return {"success": True, "document_type": "AIS (Annual Information Statement)", "extracted_data": extracted}
    except ValueError as exc:
        return {"success": False, "error": str(exc)}
    except Exception as exc:
        return {"success": False, "error": f"Unexpected parse error: {exc}"}

    return {
        "success": False,
        "error": "Document type not recognized. Please label it as Form 16, Form 26AS, or AIS.",
    }


# ── Reconciliation ────────────────────────────────────────────────────────────

def reconcile_documents(form16, form26as, ais) -> dict:
    discrepancies = []
    matches = []

    t16  = form16["extracted_data"]  if form16  else None
    t26  = form26as["extracted_data"] if form26as else None
    tais = ais["extracted_data"]     if ais     else None

    if t16 and t26:
        tan    = t16["employer"]["tan"]
        tds_16 = t16["tax_deducted"]["tds_salary"]
        entry26 = next((e for e in t26["tds_summary"] if e["tan"] == tan), None)
        if entry26:
            if entry26["tax_deducted"] == tds_16:
                matches.append({
                    "item": "Employer TDS (Salary)",
                    "details": f"TDS amount of ₹{tds_16:,} matches between Form 16 and Form 26AS.",
                })
            else:
                discrepancies.append({
                    "severity": "CRITICAL",
                    "item": "Employer TDS Mismatch",
                    "description": (
                        f"TDS in Form 16 (₹{tds_16:,}) does not match Form 26AS "
                        f"(₹{entry26['tax_deducted']:,}). Claiming higher TDS may trigger a notice."
                    ),
                })
        else:
            discrepancies.append({
                "severity": "WARNING",
                "item": "Employer Missing in 26AS",
                "description": f"Employer TAN {tan} from Form 16 has no TDS deposits in Form 26AS.",
            })

    if tais:
        ais_interest = tais.get("savings_interest", {}).get("total", 0)
        if ais_interest > 0:
            discrepancies.append({
                "severity": "WARNING",
                "item": "Savings Account Interest Found in AIS",
                "description": (
                    f"AIS reports ₹{ais_interest:,} of savings bank interest not in Form 16. "
                    "Declare under 'Income from Other Sources' (80TTA exemption applies)."
                ),
            })
        ais_div = tais.get("dividend_income", {}).get("total", 0)
        if ais_div > 0:
            discrepancies.append({
                "severity": "WARNING",
                "item": "Dividend Income Found in AIS",
                "description": (
                    f"AIS reports ₹{ais_div:,} of dividend income. "
                    "Add under 'Income from Other Sources'."
                ),
            })
        ais_stcg = sum(s.get("stcg", 0) for s in tais.get("securities_transactions", []))
        if ais_stcg > 0:
            discrepancies.append({
                "severity": "WARNING",
                "item": "Short Term Capital Gains (STCG) Found in AIS",
                "description": (
                    f"AIS reports STCG of ₹{ais_stcg:,}. Declare under Schedule CG."
                ),
            })

    if t26 and t26.get("advance_tax"):
        total_adv = sum(c["amount"] for c in t26["advance_tax"])
        matches.append({
            "item": "Advance Tax Deposits",
            "details": (
                f"Form 26AS shows ₹{total_adv:,} deposited as Advance Tax "
                f"across {len(t26['advance_tax'])} challan(s)."
            ),
        })

    return {"reconciled": True, "discrepancies": discrepancies, "matches": matches}
