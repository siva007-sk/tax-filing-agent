import json
from pathlib import Path

# ── rules cache ────────────────────────────────────────────────────────────────
# Loaded lazily from DB; invalidated when regulation_analyzer applies changes.

_rules_cache: dict | None = None

_CORPUS_FALLBACK_PATH = Path(__file__).parent.parent / "config" / "taxCorpus.json"

_CHAPTER_VIA_FALLBACK = {
    "80C": 150_000,
    "80D_self_general": 25_000,
    "80D_self_senior": 50_000,
    "80D_parents_general": 25_000,
    "80D_parents_senior": 50_000,
    "80CCD_1B": 50_000,
    "80TTA": 10_000,
    "80TTB": 50_000,
    "80EEA": 150_000,
    "80U_normal": 75_000,
    "80U_severe": 125_000,
}


def _load_rules() -> dict:
    global _rules_cache
    if _rules_cache is not None:
        return _rules_cache
    try:
        from database import get_tax_rules
        db_rules = get_tax_rules("2026-27")
        if db_rules:
            _rules_cache = db_rules
            return _rules_cache
    except Exception:
        pass
    # Fallback: read from JSON file
    with open(_CORPUS_FALLBACK_PATH, encoding="utf-8") as f:
        corpus = json.load(f)
    _rules_cache = {
        **corpus,
        "chapter_via_limits": _CHAPTER_VIA_FALLBACK,
    }
    return _rules_cache


def invalidate_rules_cache() -> None:
    global _rules_cache
    _rules_cache = None


def get_current_rules() -> dict:
    return _load_rules()


# ── helpers ────────────────────────────────────────────────────────────────────

def round_to_nearest_ten(amount: float) -> int:
    return round(amount / 10) * 10


def calculate_hra_exemption(basic: float, hra_received: float, rent_paid: float, is_metro: bool = False) -> float:
    if not basic or not hra_received or not rent_paid:
        return 0
    excess_rent = max(0.0, rent_paid - basic * 0.1)
    basic_pct = basic * 0.5 if is_metro else basic * 0.4
    return min(hra_received, excess_rent, basic_pct)


def calculate_slab_tax(taxable_income: float, slabs: list) -> float:
    tax = 0.0
    for slab in slabs:
        min_val = slab["min"]
        max_val = slab["max"]
        rate = slab["rate"] / 100
        if taxable_income > min_val:
            if max_val is None:
                slab_income = taxable_income - min_val
            else:
                slab_income = min(taxable_income - min_val, max_val - min_val)
            tax += slab_income * rate
    return tax


# ── main computation ───────────────────────────────────────────────────────────

def compute_tax(profile: dict) -> dict:
    rules = _load_rules()
    via   = rules.get("chapter_via_limits", _CHAPTER_VIA_FALLBACK)

    age_category = profile["personal"].get("age_category", "general")
    sal = profile["income"]["salary"]
    is_salaried = (sal.get("basic", 0) + sal.get("special", 0)) > 0

    # ── NEW REGIME ─────────────────────────────────────────────────────────────
    new_sd    = rules["standard_deduction"]["new_regime"] if is_salaried else 0
    new_slabs = rules["slabs"]["new_regime"]

    new_rebate_cfg = rules["rebates"]["section_87a"]["new_regime"]
    new_rebate_limit  = new_rebate_cfg["limit"]
    new_rebate_max    = new_rebate_cfg["max_rebate"]

    new_gross_salary = (sal.get("basic", 0) + sal.get("hra", 0)
                        + sal.get("lta", 0) + sal.get("special", 0))
    hp = profile["income"]["house_property"]
    new_hp_income = max(0.0, hp.get("rental", 0) - hp.get("municipal_taxes", 0))
    other = profile["income"]["other_sources"]
    other_sources = other.get("interest", 0) + other.get("dividend", 0) + other.get("family_pension", 0)
    cg = profile["income"]["capital_gains"]
    capital_gains = cg.get("stcg_111a", 0) + cg.get("ltcg_112a", 0)
    business_income = profile["income"]["business_profession"].get("turnover", 0)

    new_gti     = new_gross_salary + new_hp_income + other_sources + capital_gains + business_income
    new_taxable = round_to_nearest_ten(max(0.0, new_gti - new_sd))

    new_base_tax = calculate_slab_tax(new_taxable, new_slabs)

    new_rebate = 0.0
    new_tax_after_rebate = new_base_tax
    if new_taxable <= new_rebate_limit:
        new_rebate = min(new_base_tax, new_rebate_max)
        new_tax_after_rebate = new_base_tax - new_rebate
    else:
        excess = new_taxable - new_rebate_limit
        if new_base_tax > excess:
            new_tax_after_rebate = excess
            new_rebate = new_base_tax - excess

    new_cess      = round_to_nearest_ten(new_tax_after_rebate * rules["cess_rate"])
    new_total_tax = round_to_nearest_ten(new_tax_after_rebate + new_cess)

    # ── OLD REGIME ─────────────────────────────────────────────────────────────
    old_sd         = rules["standard_deduction"]["old_regime"] if is_salaried else 0
    old_slabs_map  = rules["slabs"]["old_regime"]
    old_rebate_cfg = rules["rebates"]["section_87a"]["old_regime"]

    if age_category == "senior":
        old_slabs = old_slabs_map["senior"]
    elif age_category == "super_senior":
        old_slabs = old_slabs_map["super_senior"]
    else:
        old_slabs = old_slabs_map["general"]

    is_metro = profile["personal"].get("residential_status") == "metro"
    hra_exemption = calculate_hra_exemption(
        sal.get("basic", 0), sal.get("hra", 0), hp.get("rental_paid", 0), is_metro
    )
    lta_exemption    = sal.get("lta", 0) if sal.get("lta_proof_submitted") else 0
    old_salary_income = max(0.0, new_gross_salary - hra_exemption - lta_exemption - old_sd)

    gross_rent = hp.get("rental", 0)
    mun_taxes  = hp.get("municipal_taxes", 0)
    nav        = max(0.0, gross_rent - mun_taxes)
    hp_std_ded = nav * 0.3
    interest_paid = hp.get("interest_paid", 0)
    hp_income  = nav - hp_std_ded - interest_paid
    if hp_income < 0:
        hp_income = max(hp_income, -200_000)

    old_gti = old_salary_income + hp_income + other_sources + capital_gains + business_income

    # Chapter VI-A deductions (driven by DB limits)
    deductions = profile.get("deductions", {})

    breakdown = deductions.get("80C", {}).get("breakdown", {})
    d80c = min(
        sum(breakdown.get(k, 0) for k in ("epf", "ppf", "elss", "lic", "tuition")),
        via.get("80C", 150_000),
    )

    d80d_data = deductions.get("80D", {})
    self_lim  = via.get("80D_self_senior", 50_000) if d80d_data.get("senior_citizen_flag") else via.get("80D_self_general", 25_000)
    par_lim   = via.get("80D_parents_senior", 50_000) if d80d_data.get("parents_senior_citizen_flag") else via.get("80D_parents_general", 25_000)
    d80d = min(d80d_data.get("self_family", 0), self_lim) + min(d80d_data.get("parents", 0), par_lim)

    d80ccd = min(deductions.get("80CCD_1B", 0), via.get("80CCD_1B", 50_000))
    d80e   = deductions.get("80E", 0)

    d80g_data = deductions.get("80G", {})
    d80g = d80g_data.get("eligible_100", 0) + d80g_data.get("eligible_50", 0) * 0.5

    d80eea = min(deductions.get("80EEA", {}).get("interest", 0), via.get("80EEA", 150_000))

    if age_category == "general":
        savings_int = min(deductions.get("80TTA", 0), via.get("80TTA", 10_000))
    else:
        savings_int = min(deductions.get("80TTB", 0), via.get("80TTB", 50_000))

    d80u_pct = deductions.get("80U", {}).get("disability_percentage", 0)
    if d80u_pct >= 80:
        d80u = via.get("80U_severe", 125_000)
    elif d80u_pct >= 40:
        d80u = via.get("80U_normal", 75_000)
    else:
        d80u = 0

    total_via = d80c + d80d + d80ccd + d80e + d80g + d80eea + savings_int + d80u

    old_taxable  = round_to_nearest_ten(max(0.0, old_gti - total_via))
    old_base_tax = calculate_slab_tax(old_taxable, old_slabs)

    old_rebate = (
        min(old_base_tax, old_rebate_cfg["max_rebate"])
        if old_taxable <= old_rebate_cfg["limit"]
        else 0.0
    )
    old_tax_after_rebate = old_base_tax - old_rebate
    old_cess      = round_to_nearest_ten(old_tax_after_rebate * rules["cess_rate"])
    old_total_tax = round_to_nearest_ten(old_tax_after_rebate + old_cess)

    optimal   = "new" if new_total_tax <= old_total_tax else "old"
    tax_saved = abs(old_total_tax - new_total_tax)

    return {
        "summary": {"optimal_regime": optimal, "tax_saved": tax_saved},
        "new_regime": {
            "gross_total_income": new_gti,
            "standard_deduction": new_sd,
            "taxable_income":     new_taxable,
            "base_tax":           new_base_tax,
            "rebate_87a":         new_rebate,
            "tax_after_rebate":   new_tax_after_rebate,
            "cess":               new_cess,
            "total_tax":          new_total_tax,
        },
        "old_regime": {
            "gross_total_income": old_gti + total_via,
            "hra_exemption":      hra_exemption,
            "lta_exemption":      lta_exemption,
            "standard_deduction": old_sd,
            "hp_loss_setoff":     abs(hp_income) if hp_income < 0 else 0,
            "deductions": {
                "sec_80C":       d80c,
                "sec_80D":       d80d,
                "sec_80CCD":     d80ccd,
                "sec_80E":       d80e,
                "sec_80G":       d80g,
                "sec_80EEA":     d80eea,
                "savings_interest": savings_int,
                "sec_80U":       d80u,
                "total":         total_via,
            },
            "taxable_income":     old_taxable,
            "base_tax":           old_base_tax,
            "rebate_87a":         old_rebate,
            "tax_after_rebate":   old_tax_after_rebate,
            "cess":               old_cess,
            "total_tax":          old_total_tax,
        },
    }
