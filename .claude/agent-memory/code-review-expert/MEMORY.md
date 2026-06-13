# Code Review Expert Memory Index

- [Tax Engine Recurring Bugs](tax-engine-bugs.md) — Known calculation_engine.py correctness issues: float money, surcharge marginal relief missing, LTCG exemption not subtracted before 87A/surcharge eligibility, gross_total_income inflated in old-regime output
- [Codebase Conventions](codebase-conventions.md) — How DB rules, caches, profiles, and deduction limits are structured across the backend
- [API Layer Patterns](api-layer-patterns.md) — Common route-layer issues: no Pydantic models, shallow profile merge, missing self_assessment_tax, ITR form selection logic wrong
