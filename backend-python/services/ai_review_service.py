from datetime import UTC, datetime
import os

import httpx

LLM_URL = os.getenv("LLM_URL", "http://localhost:8080/v1/chat/completions")


async def review_itr(profile: dict, tax_data: dict) -> dict:
    flags = []
    suggestions = []
    score = 100

    chosen_regime = profile.get("regime", {}).get("chosen", "new")
    regime_data = tax_data.get(f"{chosen_regime}_regime", {})
    computed_tax = regime_data.get("total_tax", 0)

    tax_paid = profile.get("tax_paid", {})
    total_tds = (
        tax_paid.get("tds_salary", 0)
        + tax_paid.get("tds_other", 0)
        + tax_paid.get("advance_tax", 0)
        + tax_paid.get("self_assessment_tax", 0)
    )

    sal = profile.get("income", {}).get("salary", {})
    gross_salary = sal.get("basic", 0) + sal.get("hra", 0) + sal.get("lta", 0) + sal.get("special", 0)

    # 1. Income completeness
    if gross_salary == 0:
        flags.append({
            "severity": "warning",
            "item": "No Income Declared",
            "detail": "No salary income has been entered. Verify income details before filing.",
        })
        score -= 15

    # 2. 80C cap
    breakdown = profile.get("deductions", {}).get("80C", {}).get("breakdown", {})
    total_80c = sum(v or 0 for v in breakdown.values())
    if total_80c > 150_000:
        excess_80c = total_80c - 150_000
        flags.append({
            "severity": "critical",
            "item": "Section 80C Over-Limit",
            "detail": (
                f"Declared ₹{total_80c:,} but cap is ₹1,50,000. "
                f"Excess ₹{excess_80c:,} will be disallowed — file correctly to avoid demand notice."
            ),
        })
        score -= 20

    # 3. 80D parents cap
    d80d = profile.get("deductions", {}).get("80D", {})
    parents_premium = d80d.get("parents", 0)
    parents_senior = d80d.get("parents_senior_citizen_flag", False)
    parents_cap = 50_000 if parents_senior else 25_000
    if parents_premium > parents_cap:
        flags.append({
            "severity": "warning",
            "item": "Section 80D Parents Premium Over-Limit",
            "detail": (
                f"Declared ₹{parents_premium:,}. Cap for "
                f"{'senior citizen' if parents_senior else 'non-senior'} parents is ₹{parents_cap:,}. "
                "Excess will be disallowed."
            ),
        })
        score -= 10

    # 4. NPS 80CCD(1B) cap
    nps = profile.get("deductions", {}).get("80CCD_1B", 0)
    if nps > 50_000:
        flags.append({
            "severity": "warning",
            "item": "Section 80CCD(1B) NPS Over-Limit",
            "detail": f"Declared ₹{nps:,} but the additional NPS deduction cap u/s 80CCD(1B) is ₹50,000.",
        })
        score -= 10

    # 5. Regime optimality
    optimal_regime = tax_data.get("summary", {}).get("optimal_regime")
    if optimal_regime and optimal_regime != chosen_regime:
        saving = tax_data.get("summary", {}).get("tax_saved", 0)
        if saving > 0:
            flags.append({
                "severity": "info",
                "item": "Sub-optimal Regime Selected",
                "detail": (
                    f"Switching to the {'New' if optimal_regime == 'new' else 'Old'} Regime "
                    f"saves ₹{saving:,} for AY 2026-27."
                ),
            })
            score -= 5

    # 6. TDS vs liability
    diff = total_tds - computed_tax
    if diff > 1_000:
        suggestions.append({
            "action": "Claim Refund of Excess TDS",
            "section": "237",
            "saving": diff,
            "detail": (
                f"You have excess TDS of ₹{diff:,}. File ITR to claim refund. "
                "Ensure correct pre-validated bank account is linked on e-filing portal."
            ),
        })
    elif diff < -5_000:
        flags.append({
            "severity": "critical",
            "item": "Tax Shortfall — Pay Before Filing",
            "detail": (
                f"Self-assessment tax of ₹{abs(diff):,} is payable u/s 140A before filing ITR. "
                "Use Challan 280 at any authorized bank or via IT portal."
            ),
        })
        score -= 25

    # 7. ITR form check
    if gross_salary > 5_000_000:
        flags.append({
            "severity": "info",
            "item": "ITR Form — Upgrade Required",
            "detail": "Gross salary exceeds ₹50 Lakh. You must file ITR-2 (not ITR-1). ITR auto-selected accordingly.",
        })

    score = max(0, score)
    verdict = "READY TO FILE" if score >= 85 else ("NEEDS REVIEW" if score >= 60 else "REQUIRES CORRECTION")

    ai_narrative = ""
    try:
        flag_text = "; ".join(f["item"] for f in flags) or "None"
        summary_text = (
            f"Gross Income: ₹{gross_salary:,}, Regime: {chosen_regime}, "
            f"Tax Liability: ₹{computed_tax:,}, TDS Paid: ₹{total_tds:,}, "
            f"80C: ₹{total_80c:,}, Flags: {len(flags)} ({flag_text})"
        )
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                LLM_URL,
                json={
                    "model": "local-model",
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior Indian tax expert and Chartered Accountant. "
                                "Write a concise 3-4 sentence professional ITR review summary. "
                                "End with the verdict: READY TO FILE, NEEDS REVIEW, or REQUIRES CORRECTION."
                            ),
                        },
                        {"role": "user", "content": f"Review this ITR for AY 2026-27: {summary_text}"},
                    ],
                    "temperature": 0.2,
                    "stream": False,
                },
            )
            if resp.status_code == 200:
                ai_narrative = resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        print(f"AI review LLM error: {exc}")

    if not ai_narrative:
        regime_label = "New" if chosen_regime == "new" else "Old"
        flag_clause = (
            "All income heads, deductions, and TDS entries appear consistent with statutory limits."
            if not flags
            else f"{len(flags)} flag(s) identified — resolve before filing to avoid scrutiny or interest under sections 234B/234C."
        )
        ai_narrative = (
            f"This ITR for AY 2026-27 has been reviewed under the {regime_label} Tax Regime. "
            f"Computed tax liability is ₹{computed_tax:,} against TDS paid of ₹{total_tds:,}. "
            f"{flag_clause} AI Confidence Score: {score}/100 — {verdict}."
        )

    return {
        "confidence_score": score,
        "verdict": verdict,
        "flags": flags,
        "suggestions": suggestions,
        "ai_narrative": ai_narrative,
        "reviewed_at": datetime.now(UTC).isoformat(),
    }
