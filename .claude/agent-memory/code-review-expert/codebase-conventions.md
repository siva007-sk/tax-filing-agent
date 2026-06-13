---
name: codebase-conventions
description: Architectural conventions, file roles, and data flow patterns in this backend
metadata:
  type: project
---

## Backend conventions established by exhaustive review (2026-06-13)

**DB-driven rules:** Tax slabs, rebates, standard deductions and cess rate all live in `tax_rules` table (keyed by AY). `calculation_engine._load_rules()` reads from DB with fallback to `config/taxCorpus.json`. `invalidate_rules_cache()` must be called after any DB write to `tax_rules`.

**Chapter VI-A limits defined in two places:** `_CHAPTER_VIA_FALLBACK` dict is copy-pasted identically in `calculation_engine.py` (lines 10-22) and `database.py` (lines 9-21). This is a known duplication. Any limit change must be made in both.

**Profile structure:** The `_DEFAULT_PROFILE` in `routes/api.py` is the canonical schema. `compute_tax(profile)` does NOT defensively default missing keys — it expects the full structure. `/tax/calculate` does NOT merge against default (bug), `/tax/optimize` does (via `_get_profile()` fallback).

**Cache invalidation pattern:** `calculation_engine.invalidate_rules_cache()` after DB writes to `tax_rules`; `rag_service.invalidate_corpus_cache()` after writes to `tax_corpus`. Both called by `regulation_analyzer`.

**Deduction keys:** Profile deductions use mixed key styles: `"80C"`, `"80D"`, `"80CCD_1B"`, `"80E"`, `"80G"`, `"80EEA"`, `"80TTA"`, `"80TTB"`, `"80U"`. Regime string is always lowercase `"new"` or `"old"` (case-sensitive comparisons throughout engine).

**Money types:** All float throughout — no Decimal used anywhere. `round_to_nearest_ten()` used as final rounding step.

**Async boundary:** All route handlers that call LLM are `async`. DB calls are synchronous sqlite3 (no async driver). `compute_tax` and `discover_deductions` are synchronous.

**How to apply:** Use this when reviewing any new route, service, or DB function to check it follows established patterns.
