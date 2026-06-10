from services.rag_service import call_llm

_FALLBACK = """Unable to analyze notice (AI model unavailable).

Standard guidance for common notices:
• Section 143(1) Intimation — Verify computed demand/refund. File rectification u/s 154 within 30 days if incorrect.
• Section 148 Reassessment Notice — Respond within 30 days; file required return.
• Section 139(9) Defective Return — Rectify and refile within 15 days of notice.
• Section 245 Adjustment — Check outstanding demand on portal; respond within 30 days.

Consult a Chartered Accountant immediately if the demand exceeds ₹10,000 or involves scrutiny assessment."""


async def analyze_notice(notice_text: str, profile: dict) -> dict:
    ay = profile.get("assessment_year", "2026-27")
    pan = profile.get("personal", {}).get("pan", "N/A")

    prompt = (
        f"An Indian taxpayer received the following Income Tax Department / CPC notice:\n\n"
        f"--- NOTICE TEXT ---\n{notice_text}\n--- END ---\n\n"
        f"Taxpayer context: AY {ay}, PAN: {pan}.\n\n"
        "Analyze and provide exactly these sections:\n\n"
        "1. NOTICE TYPE\n"
        "   (e.g., Section 143(1) intimation, Section 148 reassessment, Section 139(9) defective return)\n\n"
        "2. PLAIN LANGUAGE SUMMARY\n"
        "   (2-3 sentences explaining what this means for the taxpayer)\n\n"
        "3. REQUIRED ACTIONS\n"
        "   (numbered list with specific deadlines)\n\n"
        "4. RESPONSE DEADLINE\n"
        "   (statutory time limit to respond)\n\n"
        "5. RISK LEVEL: LOW / MEDIUM / HIGH\n"
        "   (with brief justification)\n\n"
        "6. DRAFT RESPONSE OUTLINE\n"
        "   (key points to include in response letter)\n\n"
        "7. PROFESSIONAL INTERVENTION REQUIRED: YES / NO\n"
        "   (CA or Tax Advocate — state why)"
    )

    try:
        analysis = await call_llm(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a senior Indian tax advocate with expertise in income tax assessments, "
                        "notices, and appeals. Provide accurate, actionable guidance structured exactly as requested."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.15,
        )
        return {"success": True, "analysis": analysis}
    except Exception as exc:
        print(f"Notice analysis LLM error: {exc}")

    return {"success": False, "analysis": _FALLBACK}
