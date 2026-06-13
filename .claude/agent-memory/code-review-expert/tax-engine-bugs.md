---
name: tax-engine-bugs
description: Recurring and known correctness bugs in calculation_engine.py and related tax math
metadata:
  type: project
---

## Known bugs confirmed in exhaustive review (2026-06-13)

**Float money (all files):** All monetary variables are Python `float`. No `decimal.Decimal` is used anywhere. The `round_to_nearest_ten` function masks most drift at the output boundary but intermediate calcs accumulate error. Recommend `Decimal` end-to-end.

**LTCG exemption not subtracted before 87A/surcharge eligibility check (lines 176, 280):**
`new_total_taxable = new_taxable_ord + stcg_111a + ltcg_112a` — full LTCG gross is included. The LTCG basic exemption of ₹1,25,000 is applied inside `calculate_capital_gains_tax` for the tax computation but NOT subtracted from the total income figure used for 87A rebate threshold and surcharge band checks. Fix: use `max(0, ltcg_112a - 125_000)` when building `*_total_taxable`.

**gross_total_income inflated in old-regime output (line 315):**
`"gross_total_income": old_ordinary_gti + total_via + stcg_111a + ltcg_112a` — `total_via` (VI-A deductions) is added back to GTI, inflating it by the deduction total. Should be `old_ordinary_gti + stcg_111a + ltcg_112a`. This wrong number appears in the generated ITR JSON.

**Surcharge marginal relief not implemented:**
`calculate_surcharge` has a comment acknowledging this omission. The ₹12L marginal relief for 87A (new regime) IS implemented, but the equivalent surcharge marginal relief at ₹50L/₹1Cr/₹2Cr thresholds is not. Will produce wrong liability for incomes just over each surcharge threshold.

**`"fixed"` field in slab JSON is never read:**
`taxCorpus.json` has `"fixed"` on every slab (e.g. `"fixed": 20000` at ₹8L–₹12L new regime). `calculate_slab_tax` iterates all slabs from zero so results are numerically correct NOW, but if LLM updates the DB with rules that rely on `fixed` as a lookup shortcut, the engine diverges silently.

**ITR form selection wrong (api.py lines 277, 341):**
Only checks `gross_salary > 5_000_000`. Ignores capital gains (require ITR-2), business income (require ITR-3), HP loss (require ITR-2). Will generate defective returns for taxpayers with CG or business income.

**Bare `except: pass` swallows DB failures (calculation_engine.py line 35, rag_service.py line 26):**
Both `_load_rules()` and `_load_corpus()` catch all exceptions silently and fall back to seed JSON. A corrupt DB produces zero operator signal.

**Why:** All found during first exhaustive review of the backend Python files.
**How to apply:** Flag these immediately in any future review of calculation_engine.py, api.py, or any file that computes or displays tax numbers.
