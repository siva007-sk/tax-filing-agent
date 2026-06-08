import json
from pathlib import Path

import httpx

from config.settings import LLM_MODEL, LLM_URL

# ── corpus cache ───────────────────────────────────────────────────────────────
# Loaded lazily from DB; invalidated when regulation_analyzer adds/updates sections.

_corpus_cache: list | None = None

_CORPUS_FALLBACK_PATH = Path(__file__).parent.parent / "config" / "taxCorpus.json"


def _load_corpus() -> list:
    global _corpus_cache
    if _corpus_cache is not None:
        return _corpus_cache
    try:
        from database import get_corpus_sections
        sections = get_corpus_sections()
        if sections:
            _corpus_cache = sections
            return _corpus_cache
    except Exception:
        pass
    # Fallback: read from JSON file
    with open(_CORPUS_FALLBACK_PATH, encoding="utf-8") as f:
        _corpus_cache = json.load(f).get("sections", [])
    return _corpus_cache


def invalidate_corpus_cache() -> None:
    global _corpus_cache
    _corpus_cache = None


# ── LLM config ─────────────────────────────────────────────────────────────────

_llm_config: dict = {
    "url":   LLM_URL,
    "model": LLM_MODEL,
}


def get_llm_config() -> dict:
    return dict(_llm_config)


def update_llm_config(url: str, model: str) -> dict:
    _llm_config["url"]   = url.strip()
    _llm_config["model"] = model.strip()
    return dict(_llm_config)


# ── keyword map ────────────────────────────────────────────────────────────────

_KEYWORDS: dict[str, list[str]] = {
    "80c":       ["investment", "ppf", "epf", "elss", "lic", "tuition", "school fees", "provident", "life insurance", "mutual fund"],
    "80d":       ["health", "medical", "insurance", "mediclaim", "parents", "senior citizen", "checkup"],
    "80ccd(1b)": ["nps", "pension", "national pension system", "retirement"],
    "80ccd":     ["nps", "pension", "national pension system"],
    "80e":       ["education", "loan", "higher education", "study", "interest"],
    "80g":       ["donation", "charity", "trust", "pm care", "relief fund", "donated"],
    "80eea":     ["first time buyer", "affordable housing", "home loan", "interest", "45 lakh", "sanctioned"],
    "80tta":     ["savings", "interest", "bank account", "post office"],
    "80ttb":     ["fixed deposit", "fd", "senior citizen", "deposit interest", "cooperative"],
    "80u":       ["disability", "disabled", "blindness", "handicapped", "severe disability"],
    "24(b)":     ["home loan", "housing interest", "self occupied", "let out", "rented", "interest paid"],
    "hra":       ["rent", "hra", "allowance", "metro", "rent paid", "landlord"],
}


def _build_slabs_context() -> str:
    """Build the slab context string from DB rules (falls back to hard-coded string)."""
    try:
        from services.calculation_engine import get_current_rules
        rules = get_current_rules()
        sd = rules.get("standard_deduction", {})
        r87a = rules.get("rebates", {}).get("section_87a", {})
        nr = r87a.get("new_regime", {})
        oreg = r87a.get("old_regime", {})

        new_slabs_lines = []
        for s in rules.get("slabs", {}).get("new_regime", []):
            lo = f"₹{s['min']//100000}L" if s["min"] else "0"
            hi = f"₹{s['max']//100000}L" if s.get("max") else "above"
            new_slabs_lines.append(f"  {lo} to {hi}: {s['rate']}%")

        nr_limit_l = nr.get("limit", 1200000) // 100000
        nr_rebate  = nr.get("max_rebate", 60000)
        or_limit_l = oreg.get("limit", 500000) // 100000
        or_rebate  = oreg.get("max_rebate", 12500)

        return (
            f"New Regime Slabs (FY 2025-26):\n"
            + "\n".join(new_slabs_lines)
            + f"\n* Standard Deduction under New Regime: ₹{sd.get('new_regime', 75000):,}."
            + f"\n* Section 87A Rebate: up to ₹{nr_rebate:,} for income ≤ ₹{nr_limit_l}L.\n\n"
            f"Old Regime Standard Deduction: ₹{sd.get('old_regime', 50000):,}.\n"
            f"Old Regime 87A Rebate: up to ₹{or_rebate:,} for income ≤ ₹{or_limit_l}L.\n"
            "Deductions (80C up to 1.5L, 80D, NPS etc.) only under Old Regime."
        )
    except Exception:
        return (
            "New Regime: 0/5/10/15/20/25/30% slabs. Std deduction ₹75,000. "
            "87A rebate up to ₹60,000 if income ≤ ₹12L.\n"
            "Old Regime: 0/5/20/30% slabs. Std deduction ₹50,000. "
            "87A rebate up to ₹12,500 if income ≤ ₹5L."
        )


# ── corpus search ──────────────────────────────────────────────────────────────

def search_corpus(query: str) -> list:
    sections = _load_corpus()
    q = query.lower()
    results = []
    for item in sections:
        score = 0
        sec   = item["section"].lower()
        title = item["title"].lower()
        desc  = item["description"].lower()

        if sec in q:
            score += 100
        for kw in _KEYWORDS.get(sec, []):
            if kw in q:
                score += 20
        if title in q:
            score += 15
        if desc in q:
            score += 10
        for word in (w for w in q.split() if len(w) > 3):
            if word in title:
                score += 2
            if word in desc:
                score += 1

        if score > 0:
            results.append({**item, "score": score})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ── RAG response ───────────────────────────────────────────────────────────────

async def get_rag_response(query: str, chat_history: list | None = None) -> dict:
    if chat_history is None:
        chat_history = []
    search_results  = search_corpus(query)
    context_chunks  = search_results[:3]

    if context_chunks:
        context_text = "\n---\n".join(
            f"Section: {c['section']}\nTitle: {c['title']}\nDescription: {c['description']}\n"
            f"Limit: {'₹' + str(c['limit']) if c.get('limit') else 'No Limit'}\nCitation: {c['citation']}"
            for c in context_chunks
        )
    else:
        context_text = (
            "No specific statutory section matched. "
            "Fall back to general Indian income tax slab rates and guidelines."
        )

    try:
        from services.tax_updater import get_live_context
        live_ctx = get_live_context(query)
    except Exception:
        live_ctx = ""

    slabs_context = _build_slabs_context()

    system_prompt = (
        "You are TaxMe, an expert Indian Tax Filing AI Assistant.\n"
        "Using the context below, answer the user's queries accurately.\n"
        "Non-negotiable Safety Rules:\n"
        "1. NEVER provide advice on tax evasion, concealment, or fraudulent deduction claims.\n"
        "2. ALWAYS cite the specific Income Tax Act sections and notification numbers when explaining claims.\n"
        '3. ALWAYS include this exact disclaimer: "Disclaimer: This is AI-assisted tax guidance. '
        'For complex litigation or business income, consult a Chartered Accountant."\n'
        "4. If a query cannot be answered using the context, state that you don't know the exact rule, "
        "but explain the general guidelines.\n\n"
        f"Context Details:\n{context_text}\n---\nSlab Details:\n{slabs_context}"
        + (f"\n\n{live_ctx}" if live_ctx else "")
    )

    messages = [
        {"role": "system", "content": system_prompt},
        *[
            {"role": "user" if t["role"] == "user" else "assistant", "content": t["text"]}
            for t in chat_history
        ],
        {"role": "user", "content": query},
    ]

    url   = _llm_config["url"]
    model = _llm_config["model"]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                json={"model": model, "messages": messages, "temperature": 0.3, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "answer": data["choices"][0]["message"]["content"],
                "citations": [
                    {"section": c["section"], "citation": c["citation"], "title": c["title"]}
                    for c in context_chunks
                ],
                "sources_found": len(context_chunks) > 0,
            }
    except Exception as exc:
        print(f"LLM unavailable: {exc}")
        return {
            "answer": None,
            "error": "llm_unavailable",
            "message": f"The local LLM is not reachable at {url}. Please start your local model and try again.",
            "citations": [],
            "sources_found": False,
        }
