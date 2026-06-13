"""
regulation_analyzer.py
Uses the configured LLM to analyze fetched tax-update articles, extract structured
regulation changes, apply scalar changes to the DB, and invalidate engine caches.
"""

import json
import re

from database import (
    add_regulation_change,
    get_tax_rules,
    get_unanalyzed_updates,
    mark_change_applied,
    mark_update_analyzed,
    update_tax_rules,
    upsert_corpus_section,
)

_VALUE_BOUNDS: dict[str, tuple[float, float]] = {
    "standard_deduction.new_regime":                (25_000, 200_000),
    "standard_deduction.old_regime":                (25_000, 100_000),
    "rebates.section_87a.new_regime.limit":         (500_000, 2_000_000),
    "rebates.section_87a.new_regime.max_rebate":    (10_000, 100_000),
    "rebates.section_87a.old_regime.limit":         (200_000, 1_000_000),
    "rebates.section_87a.old_regime.max_rebate":    (5_000, 50_000),
    "cess_rate":                                    (0.01, 0.10),
    "chapter_via_limits.80C":                       (100_000, 300_000),
    "chapter_via_limits.80D_self_general":          (10_000, 50_000),
    "chapter_via_limits.80D_self_senior":           (25_000, 100_000),
    "chapter_via_limits.80D_parents_general":       (10_000, 50_000),
    "chapter_via_limits.80D_parents_senior":        (25_000, 100_000),
    "chapter_via_limits.80CCD_1B":                  (25_000, 100_000),
    "chapter_via_limits.80TTA":                     (5_000, 25_000),
    "chapter_via_limits.80TTB":                     (25_000, 100_000),
    "chapter_via_limits.80EEA":                     (100_000, 300_000),
    "chapter_via_limits.80U_normal":                (50_000, 150_000),
    "chapter_via_limits.80U_severe":                (75_000, 200_000),
}

_VALID_FIELD_PATHS = {
    "standard_deduction.new_regime",
    "standard_deduction.old_regime",
    "rebates.section_87a.new_regime.limit",
    "rebates.section_87a.new_regime.max_rebate",
    "rebates.section_87a.old_regime.limit",
    "rebates.section_87a.old_regime.max_rebate",
    "cess_rate",
    "chapter_via_limits.80C",
    "chapter_via_limits.80D_self_general",
    "chapter_via_limits.80D_self_senior",
    "chapter_via_limits.80D_parents_general",
    "chapter_via_limits.80D_parents_senior",
    "chapter_via_limits.80CCD_1B",
    "chapter_via_limits.80TTA",
    "chapter_via_limits.80TTB",
    "chapter_via_limits.80EEA",
    "chapter_via_limits.80U_normal",
    "chapter_via_limits.80U_severe",
}

_ANALYSIS_PROMPT = """You are a precise Indian income tax regulation parser for AY 2026-27 (FY 2025-26).

Read this article and determine if it describes any CONFIRMED changes to Indian income tax rules effective for FY 2025-26 / AY 2026-27.

Article Title: {title}
Article Content: {snippet}

Only flag changes that are definitively enacted (Budget 2025 announcements, Finance Act amendments, CBDT circulars). Do NOT flag proposed, speculative, or historical changes.

If regulation changes are confirmed, respond ONLY with a JSON object like:
{{
  "has_changes": true,
  "changes": [
    {{
      "change_type": "standard_deduction",
      "regime": "new",
      "description": "Standard deduction under new regime increased from ₹50,000 to ₹75,000",
      "field_path": "standard_deduction.new_regime",
      "new_value": 75000
    }}
  ]
}}

Valid change_type values: standard_deduction, deduction_limit, rebate_87a, cess_rate, new_section

Valid field_path values (use EXACTLY these strings):
- standard_deduction.new_regime
- standard_deduction.old_regime
- rebates.section_87a.new_regime.limit
- rebates.section_87a.new_regime.max_rebate
- rebates.section_87a.old_regime.limit
- rebates.section_87a.old_regime.max_rebate
- cess_rate
- chapter_via_limits.80C
- chapter_via_limits.80D_self_general
- chapter_via_limits.80D_self_senior
- chapter_via_limits.80D_parents_general
- chapter_via_limits.80D_parents_senior
- chapter_via_limits.80CCD_1B
- chapter_via_limits.80TTA
- chapter_via_limits.80TTB
- chapter_via_limits.80EEA
- chapter_via_limits.80U_normal
- chapter_via_limits.80U_severe

For new_section change_type, use this structure instead:
{{
  "change_type": "new_section",
  "description": "New Section 80CCH deduction for Agnipath scheme contributions",
  "section": {{
    "id": "sec_80cch",
    "section": "80CCH",
    "title": "Deduction for Agniveer Corpus Fund",
    "description": "Deduction for contributions made to Agniveer Corpus Fund.",
    "limit": 50000,
    "regimes": ["old"],
    "eligibility": "Agniveers enrolled under Agnipath Scheme.",
    "citation": "Income Tax Act, 1961 - Section 80CCH"
  }}
}}

If no confirmed regulation changes are described, respond with:
{{"has_changes": false}}

Respond ONLY with valid JSON. No markdown, no explanation."""


def _apply_field_path(rules: dict, path: str, value) -> dict:
    """Apply a scalar value at a dot-notation path in the rules dict."""
    parts = path.split(".")
    node = rules
    for part in parts[:-1]:
        if part not in node:
            node[part] = {}
        node = node[part]
    node[parts[-1]] = value
    return rules


def _get_old_value(rules: dict, path: str):
    """Read current value at dot-notation path, or None if missing."""
    parts = path.split(".")
    node = rules
    for part in parts:
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _extract_json(text: str) -> dict | None:
    """Extract the first JSON object from LLM response text."""
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return None


async def analyze_and_apply_new_updates() -> dict:
    """
    Analyze all unanalyzed tax-update articles with the LLM.
    Apply detected changes to the DB and invalidate engine caches.
    Returns a summary dict.
    """
    from services.rag_service import call_llm, invalidate_corpus_cache
    from services.calculation_engine import invalidate_rules_cache

    articles = get_unanalyzed_updates(limit=10)

    if not articles:
        return {"analyzed": 0, "changes_found": 0, "changes_applied": 0}

    total_changes = 0
    total_applied = 0

    for article in articles:
        prompt = _ANALYSIS_PROMPT.format(
            title=article["title"],
            snippet=(article.get("snippet") or "")[:600],
        )

        try:
            raw = await call_llm([{"role": "user", "content": prompt}], temperature=0.0, max_tokens=800)
        except Exception as exc:
            print(f"[RegAnalyzer] LLM call failed: {exc}")
            continue

        parsed = _extract_json(raw)
        mark_update_analyzed(article["id"])

        if not parsed or not parsed.get("has_changes"):
            continue

        changes = parsed.get("changes", [])
        if not changes:
            continue

        rules = get_tax_rules("2026-27") or {}

        for c in changes:
            change_type = c.get("change_type", "")
            description = c.get("description", "").strip()
            if not description:
                continue

            if change_type == "new_section":
                section_data = c.get("section")
                if not isinstance(section_data, dict) or not section_data.get("id"):
                    continue
                reg_id = add_regulation_change({
                    "update_id": article["id"],
                    "change_type": "new_section",
                    "description": description,
                    "section": section_data.get("section"),
                    "new_value": section_data,
                })
                upsert_corpus_section(section_data)
                mark_change_applied(reg_id)
                invalidate_corpus_cache()
                total_changes += 1
                total_applied += 1

            elif c.get("field_path") in _VALID_FIELD_PATHS:
                field_path = c["field_path"]
                new_value = c.get("new_value")
                if new_value is None:
                    continue
                try:
                    new_value = float(new_value)
                except (TypeError, ValueError):
                    continue

                bounds = _VALUE_BOUNDS.get(field_path)
                if bounds:
                    lo, hi = bounds
                    if not (lo <= new_value <= hi):
                        print(f"[RegAnalyzer] REJECTED out-of-bounds: {field_path}={new_value} (allowed {lo}–{hi})")
                        continue

                old_value = _get_old_value(rules, field_path)
                if old_value == new_value:
                    # Already up to date — mark as detected but skip apply
                    add_regulation_change({
                        "update_id": article["id"],
                        "change_type": change_type,
                        "regime": c.get("regime"),
                        "section": c.get("section"),
                        "description": description,
                        "field_path": field_path,
                        "old_value": old_value,
                        "new_value": new_value,
                    })
                    total_changes += 1
                    continue

                reg_id = add_regulation_change({
                    "update_id": article["id"],
                    "change_type": change_type,
                    "regime": c.get("regime"),
                    "section": c.get("section"),
                    "description": description,
                    "field_path": field_path,
                    "old_value": old_value,
                    "new_value": new_value,
                })

                rules = _apply_field_path(rules, field_path, new_value)
                update_tax_rules("2026-27", rules)
                mark_change_applied(reg_id)
                invalidate_rules_cache()
                total_changes += 1
                total_applied += 1
                print(f"[RegAnalyzer] Applied: {field_path} → {new_value}")

    return {
        "analyzed": len(articles),
        "changes_found": total_changes,
        "changes_applied": total_applied,
    }
