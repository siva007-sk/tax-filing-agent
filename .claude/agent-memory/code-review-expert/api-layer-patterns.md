---
name: api-layer-patterns
description: Known issues and patterns in routes/api.py and the API layer
metadata:
  type: project
---

## API layer findings from exhaustive review (2026-06-13)

**No Pydantic models:** All compute endpoints (`/tax/optimize`, `/tax/calculate`, `/scenarios/simulate`, `/deductions/discover`) take raw `request.json()` and pass it directly to computation functions. No input validation, no size limit, no type coercion. This is a systemic pattern — any new endpoint should use Pydantic.

**Shallow profile merge bug (`/memory/update` line 359):** `profile.update(updates)` is a shallow merge. Sending a partial nested update (e.g. only `income.salary.basic`) destroys all sibling keys. Deep merge required.

**self_assessment_tax missing from total_paid (line 270):** `total_paid` sums TDS + advance_tax but omits `self_assessment_tax`. The profile schema includes it. ITR `NetRefundPayable` is wrong for any taxpayer who paid SAT.

**ITR form selection wrong (lines 277, 341):** Only uses `gross_salary > 5_000_000`. Must check capital gains (ITR-2), business income (ITR-3), HP loss (ITR-2). See [[tax-engine-bugs]] for full detail.

**`/tax/calculate` does not merge against `_DEFAULT_PROFILE`:** Raw body is passed to `compute_tax`. A partial JSON body causes KeyError → 500.

**`float()` in scenario simulator unguarded (line 213):** Non-numeric `amount` raises unhandled ValueError → 500.

**How to apply:** Check every new endpoint for these patterns before approving.
