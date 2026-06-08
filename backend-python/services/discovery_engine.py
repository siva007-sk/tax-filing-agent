def discover_deductions(profile: dict, signals: list | None = None) -> dict:
    if signals is None:
        signals = []
    recommendations = []
    questions = []

    sal = profile["income"]["salary"]
    deductions = profile.get("deductions", {})

    d80c_data = deductions.get("80C", {})
    breakdown = d80c_data.get("breakdown", {})
    current_80c = sum(breakdown.get(k, 0) for k in ("epf", "ppf", "elss", "lic", "tuition"))

    d80d_data = deductions.get("80D", {})
    current_80d = d80d_data.get("self_family", 0) + d80d_data.get("parents", 0)
    current_nps = deductions.get("80CCD_1B", 0)

    has_home_loan = (
        profile["income"]["house_property"].get("interest_paid", 0) > 0
        or deductions.get("80EEA", {}).get("interest", 0) > 0
    )

    # 1. Section 80C
    if current_80c < 150_000:
        remaining = 150_000 - current_80c
        if "children" in signals and not breakdown.get("tuition", 0):
            questions.append({
                "id": "q_tuition",
                "section": "80C",
                "question": "Are you paying school/tuition fees for your children? You can claim this deduction under Section 80C.",
                "potentialLimit": 150_000,
            })
        recommendations.append({
            "section": "80C",
            "action": f"Invest up to ₹{remaining:,} in Equity Linked Savings Schemes (ELSS) or PPF.",
            "description": "Under Section 80C, you can reduce taxable income by investing in tax-saving financial instruments.",
            "max_saving": round(remaining * 0.3),
            "deadline": "31-Mar-2026",
            "documents": ["ELSS Statement", "PPF Passbook copy"],
        })

    # 2. Section 80D
    if "parents_senior" in signals and not d80d_data.get("parents", 0):
        questions.append({
            "id": "q_parents_health",
            "section": "80D",
            "question": "Do you pay health insurance premiums for your parents who are senior citizens (above 60)?",
            "potentialLimit": 50_000,
        })
        recommendations.append({
            "section": "80D",
            "action": "Claim health insurance premium paid for senior parents.",
            "description": "Under Section 80D, you get an additional deduction limit of up to ₹50,000 for premiums paid on behalf of senior citizen parents.",
            "max_saving": 15_000,
            "deadline": "31-Mar-2026",
            "documents": ["Health Insurance Premium Receipt", "80D certificate from insurer"],
        })
    elif "parents_senior" not in signals and current_80d == 0:
        questions.append({
            "id": "q_self_health",
            "section": "80D",
            "question": "Do you have a health insurance policy for yourself or your family?",
            "potentialLimit": 25_000,
        })

    # 3. NPS — 80CCD(1B)
    if current_nps < 50_000:
        remaining_nps = 50_000 - current_nps
        recommendations.append({
            "section": "80CCD(1B)",
            "action": f"Invest ₹{remaining_nps:,} in NPS Tier-1 account.",
            "description": "An additional exclusive deduction of ₹50,000 is allowed u/s 80CCD(1B) for voluntary NPS contributions. This is above the ₹1.5L limit of 80C.",
            "max_saving": round(remaining_nps * 0.3),
            "deadline": "31-Mar-2026",
            "documents": ["NPS Transaction Statement / PRAN statement"],
        })
        if "nps" not in signals:
            questions.append({
                "id": "q_nps",
                "section": "80CCD(1B)",
                "question": "Would you like to invest in the National Pension System (NPS) to claim an additional ₹50,000 tax deduction?",
                "potentialLimit": 50_000,
            })

    # 4. Home loan — 80EEA / 24(b)
    if "home_loan" in signals and not has_home_loan:
        questions.append({
            "id": "q_home_loan_first_time",
            "section": "80EEA / 24(b)",
            "question": "Do you pay interest on a home loan? If you are a first-time buyer, you might be eligible for additional benefits.",
            "potentialLimit": 150_000,
        })

    # 5. Electric Vehicle — 80EEB
    if "ev" in signals and not deductions.get("80EEB", 0):
        questions.append({
            "id": "q_ev_loan",
            "section": "80EEB",
            "question": "Have you taken a loan to purchase an Electric Vehicle? You can claim interest deductions u/s 80EEB.",
            "potentialLimit": 150_000,
        })

    # 6. Savings interest — 80TTA / 80TTB
    current_interest = profile["income"]["other_sources"].get("interest", 0)
    is_senior = profile["personal"].get("age_category") in ("senior", "super_senior")
    claimed_tta_ttb = deductions.get("80TTB", 0) if is_senior else deductions.get("80TTA", 0)

    if current_interest > 0 and claimed_tta_ttb == 0:
        label = "80TTB" if is_senior else "80TTA"
        cap = 50_000 if is_senior else 10_000
        eligible = min(current_interest, cap)
        recommendations.append({
            "section": label,
            "action": f"Claim interest deduction of ₹{eligible:,} on savings bank/deposit interest.",
            "description": f"Under Section {label}, interest earned is exempt up to ₹{cap:,}.",
            "max_saving": round(eligible * 0.3),
            "deadline": "Filing date",
            "documents": ["Bank Passbooks / Interest Certificates"],
        })

    # 7. HRA without rent declared
    if sal.get("hra", 0) > 0 and profile["income"]["house_property"].get("rental_paid", 0) == 0:
        questions.append({
            "id": "q_rent_receipts",
            "section": "HRA Exemption",
            "question": "You receive HRA from your employer but haven't declared paying rent. Do you live in rented accommodation?",
            "potentialLimit": None,
        })

    return {"recommendations": recommendations, "questions": questions}
