import json
from pathlib import Path

# ── rules cache ────────────────────────────────────────────────────────────────

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
    with open(_CORPUS_FALLBACK_PATH, encoding="utf-8") as f:
        corpus = json.load(f)
    _rules_cache = {**corpus, "chapter_via_limits": _CHAPTER_VIA_FALLBACK}
    return _rules_cache


def invalidate_rules_cache() -> None:
    global _rules_cache
    _rules_cache = None


def get_current_rules() -> dict:
    return _load_rules()


# ── helpers ────────────────────────────────────────────────────────────────────

def round_to_nearest_ten(amount: float) -> int:
    return round(amount / 10) * 10


def calculate_hra_exemption(
    basic: float, hra_received: float, rent_paid: float, is_metro: bool = False
) -> float:
    if not basic or not hra_received or not rent_paid:
        return 0.0
    excess_rent = max(0.0, rent_paid - basic * 0.1)
    basic_pct   = basic * 0.5 if is_metro else basic * 0.4
    return min(hra_received, excess_rent, basic_pct)


def calculate_slab_tax(taxable_income: float, slabs: list) -> float:
    tax = 0.0
    for slab in slabs:
        min_val = slab["min"]
        max_val = slab["max"]
        rate    = slab["rate"] / 100
        if taxable_income > min_val:
            slab_income = (
                taxable_income - min_val
                if max_val is None
                else min(taxable_income - min_val, max_val - min_val)
            )
            tax += slab_income * rate
    return tax


def calculate_surcharge(tax: float, total_income: float, regime: str) -> int:
    """
    Surcharge per Finance Act 2025 / AY 2026-27.
    New regime cap: 25%. Old regime: 37% above ₹5 Cr.
    Marginal relief not applied here (negligible for salaried / typical cases).
    """
    if total_income <= 5_000_000:
        return 0
    if total_income <= 10_000_000:
        rate = 0.05
    elif total_income <= 20_000_000:
        rate = 0.15
    elif total_income <= 50_000_000:
        rate = 0.25
    else:
        # New regime capped at 25%; old regime allows 37%
        rate = 0.25 if regime == "new" else 0.37
    return round_to_nearest_ten(tax * rate)


def calculate_capital_gains_tax(stcg_111a: float, ltcg_112a: float) -> tuple:
    """
    Special-rate capital gains tax per Finance Act 2024 (effective 23 Jul 2024).
      STCG u/s 111A  : 20% flat (equity / equity-oriented MF held ≤ 12 months).
      LTCG u/s 112A  : 12.5% on gains exceeding ₹1,25,000 exemption
                       (equity / equity-oriented MF held > 12 months).
    Returns (stcg_tax, ltcg_tax, ltcg_exempt_amount).
    These are NOT included in slab-rate computation.
    """
    stcg_tax    = round_to_nearest_ten(stcg_111a * 0.20)
    ltcg_exempt = min(ltcg_112a, 125_000)
    ltcg_taxable = max(0.0, ltcg_112a - ltcg_exempt)
    ltcg_tax    = round_to_nearest_ten(ltcg_taxable * 0.125)
    return stcg_tax, ltcg_tax, ltcg_exempt


# ── main computation ───────────────────────────────────────────────────────────

def compute_tax(profile: dict) -> dict:
    rules = _load_rules()
    via   = rules.get("chapter_via_limits", _CHAPTER_VIA_FALLBACK)

    age_category = profile["personal"].get("age_category", "general")
    sal          = profile["income"]["salary"]
    is_salaried  = (sal.get("basic", 0) + sal.get("special", 0)) > 0

    # ── Common income components ───────────────────────────────────────────────
    gross_salary_receipt = (
        sal.get("basic", 0) + sal.get("hra", 0)
        + sal.get("lta", 0) + sal.get("special", 0)
    )
    hp    = profile["income"]["house_property"]
    other = profile["income"]["other_sources"]
    cg    = profile["income"]["capital_gains"]

    # Family pension: deduction u/s 57(iia) — lower of 1/3 of pension or ₹15,000
    # Available under both regimes (it's a Sec 57 deduction, not Chapter VI-A).
    family_pension     = other.get("family_pension", 0)
    fp_deduction       = min(int(family_pension // 3), 15_000) if family_pension else 0
    family_pension_net = max(0.0, family_pension - fp_deduction)

    other_sources = (
        other.get("interest", 0)
        + other.get("dividend", 0)
        + family_pension_net
    )

    business_income = profile["income"]["business_profession"].get("turnover", 0)

    # Capital gains — taxed at special flat rates, NOT at slab rates (Finance Act 2024)
    stcg_111a = cg.get("stcg_111a", 0)
    ltcg_112a = cg.get("ltcg_112a", 0)
    stcg_tax, ltcg_tax, ltcg_exempt = calculate_capital_gains_tax(stcg_111a, ltcg_112a)
    cg_tax = stcg_tax + ltcg_tax

    # ── NEW REGIME ─────────────────────────────────────────────────────────────
    new_sd_limit = rules["standard_deduction"]["new_regime"]
    # Standard deduction cannot exceed gross salary income
    new_sd    = min(new_sd_limit, gross_salary_receipt) if is_salaried else 0
    new_slabs = rules["slabs"]["new_regime"]

    new_rebate_cfg   = rules["rebates"]["section_87a"]["new_regime"]
    new_rebate_limit = new_rebate_cfg["limit"]    # ₹12,00,000
    new_rebate_max   = new_rebate_cfg["max_rebate"]  # ₹60,000

    # New regime: HP income = net rental only (no 30% std deduction, no loan interest)
    new_hp_income    = max(0.0, hp.get("rental", 0) - hp.get("municipal_taxes", 0))
    new_ordinary_gti = gross_salary_receipt + new_hp_income + other_sources + business_income
    new_taxable_ord  = round_to_nearest_ten(max(0.0, new_ordinary_gti - new_sd))
    new_slab_tax     = calculate_slab_tax(new_taxable_ord, new_slabs)

    # Total taxable income for 87A eligibility check (includes full CG — not net of exemption)
    new_total_taxable = new_taxable_ord + stcg_111a + ltcg_112a
    new_base_tax      = new_slab_tax + cg_tax

    # 87A rebate (new regime): with marginal relief for income just above ₹12L
    new_rebate = 0.0
    if new_total_taxable <= new_rebate_limit:
        new_rebate           = min(new_base_tax, new_rebate_max)
        new_tax_after_rebate = new_base_tax - new_rebate
    else:
        # Marginal relief: tax payable cannot exceed amount by which income exceeds ₹12L
        excess = new_total_taxable - new_rebate_limit
        if new_base_tax > excess:
            new_rebate           = new_base_tax - excess
            new_tax_after_rebate = excess
        else:
            new_tax_after_rebate = new_base_tax

    new_surcharge = calculate_surcharge(new_tax_after_rebate, new_total_taxable, "new")
    new_cess      = round_to_nearest_ten((new_tax_after_rebate + new_surcharge) * rules["cess_rate"])
    new_total_tax = round_to_nearest_ten(new_tax_after_rebate + new_surcharge + new_cess)

    # ── OLD REGIME ─────────────────────────────────────────────────────────────
    old_sd_limit = rules["standard_deduction"]["old_regime"]
    old_sd       = min(old_sd_limit, gross_salary_receipt) if is_salaried else 0
    old_slabs_map  = rules["slabs"]["old_regime"]
    old_rebate_cfg = rules["rebates"]["section_87a"]["old_regime"]

    if age_category == "senior":
        old_slabs = old_slabs_map["senior"]
    elif age_category == "super_senior":
        old_slabs = old_slabs_map["super_senior"]
    else:
        old_slabs = old_slabs_map["general"]

    is_metro      = profile["personal"].get("residential_status") == "metro"
    hra_exemption = calculate_hra_exemption(
        sal.get("basic", 0), sal.get("hra", 0), hp.get("rental_paid", 0), is_metro
    )
    lta_exemption     = sal.get("lta", 0) if sal.get("lta_proof_submitted") else 0
    old_salary_income = max(0.0, gross_salary_receipt - hra_exemption - lta_exemption - old_sd)

    # House property income u/s 24: NAV - 30% std deduction - loan interest
    # Loss from HP (self-occupied or let-out) capped at ₹2,00,000 setoff u/s 71
    gross_rent  = hp.get("rental", 0)
    mun_taxes   = hp.get("municipal_taxes", 0)
    nav         = max(0.0, gross_rent - mun_taxes)
    hp_std_ded  = nav * 0.3
    interest_24b = hp.get("interest_paid", 0)
    hp_income   = nav - hp_std_ded - interest_24b
    if hp_income < 0:
        hp_income = max(hp_income, -200_000)  # ₹2L annual setoff cap u/s 71

    old_ordinary_gti = old_salary_income + hp_income + other_sources + business_income

    # Chapter VI-A deductions (old regime only)
    deductions = profile.get("deductions", {})

    breakdown = deductions.get("80C", {}).get("breakdown", {})
    d80c = min(
        sum(breakdown.get(k, 0) for k in ("epf", "ppf", "elss", "lic", "tuition")),
        via.get("80C", 150_000),
    )

    d80d_data = deductions.get("80D", {})
    self_lim  = (
        via.get("80D_self_senior", 50_000)
        if d80d_data.get("senior_citizen_flag")
        else via.get("80D_self_general", 25_000)
    )
    par_lim = (
        via.get("80D_parents_senior", 50_000)
        if d80d_data.get("parents_senior_citizen_flag")
        else via.get("80D_parents_general", 25_000)
    )
    d80d = (
        min(d80d_data.get("self_family", 0), self_lim)
        + min(d80d_data.get("parents", 0), par_lim)
    )

    d80ccd = min(deductions.get("80CCD_1B", 0), via.get("80CCD_1B", 50_000))
    d80e   = deductions.get("80E", 0)  # No upper limit on education loan interest

    d80g_data = deductions.get("80G", {})
    d80g = d80g_data.get("eligible_100", 0) + d80g_data.get("eligible_50", 0) * 0.5

    # 80EEA: loan must have been sanctioned between 1 Apr 2019 – 31 Mar 2023
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

    old_taxable_ord   = round_to_nearest_ten(max(0.0, old_ordinary_gti - total_via))
    old_total_taxable = old_taxable_ord + stcg_111a + ltcg_112a
    old_slab_tax      = calculate_slab_tax(old_taxable_ord, old_slabs)
    old_base_tax      = old_slab_tax + cg_tax

    # 87A rebate (old regime): ₹12,500 if total income ≤ ₹5L.
    # Rebate applies only against slab tax — NOT against STCG/LTCG special-rate tax.
    old_rebate = (
        min(old_slab_tax, old_rebate_cfg["max_rebate"])
        if old_total_taxable <= old_rebate_cfg["limit"]
        else 0.0
    )
    old_tax_after_rebate = old_base_tax - old_rebate
    old_surcharge = calculate_surcharge(old_tax_after_rebate, old_total_taxable, "old")
    old_cess      = round_to_nearest_ten((old_tax_after_rebate + old_surcharge) * rules["cess_rate"])
    old_total_tax = round_to_nearest_ten(old_tax_after_rebate + old_surcharge + old_cess)

    optimal   = "new" if new_total_tax <= old_total_tax else "old"
    tax_saved = abs(old_total_tax - new_total_tax)

    return {
        "summary": {"optimal_regime": optimal, "tax_saved": tax_saved},
        "new_regime": {
            "gross_total_income":   new_ordinary_gti + stcg_111a + ltcg_112a,
            "standard_deduction":   new_sd,
            "taxable_income":       new_total_taxable,
            "slab_tax":             new_slab_tax,
            "capital_gains_tax":    cg_tax,
            "base_tax":             new_base_tax,
            "rebate_87a":           new_rebate,
            "tax_after_rebate":     new_tax_after_rebate,
            "surcharge":            new_surcharge,
            "cess":                 new_cess,
            "total_tax":            new_total_tax,
        },
        "old_regime": {
            "gross_total_income":   old_ordinary_gti + total_via + stcg_111a + ltcg_112a,
            "hra_exemption":        hra_exemption,
            "lta_exemption":        lta_exemption,
            "standard_deduction":   old_sd,
            "hp_loss_setoff":       abs(hp_income) if hp_income < 0 else 0,
            "deductions": {
                "sec_80C":          d80c,
                "sec_80D":          d80d,
                "sec_80CCD":        d80ccd,
                "sec_80E":          d80e,
                "sec_80G":          d80g,
                "sec_80EEA":        d80eea,
                "savings_interest": savings_int,
                "sec_80U":          d80u,
                "total":            total_via,
            },
            "taxable_income":       old_total_taxable,
            "slab_tax":             old_slab_tax,
            "capital_gains_tax":    cg_tax,
            "base_tax":             old_base_tax,
            "rebate_87a":           old_rebate,
            "tax_after_rebate":     old_tax_after_rebate,
            "surcharge":            old_surcharge,
            "cess":                 old_cess,
            "total_tax":            old_total_tax,
        },
    }
