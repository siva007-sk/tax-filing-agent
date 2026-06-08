# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install all dependencies (run from root):**
```bash
npm run install-all
```

**Run both frontend and backend in dev mode (local):**
```bash
npm run dev
```

**Run backend only (FastAPI):**
```bash
cd backend-python && uvicorn main:app --port 5000 --reload
```

**Build frontend:**
```bash
npm run build
```

The frontend (Vite) runs on `http://localhost:5173` and proxies `/api/*` to the backend at `http://localhost:5000`.

## Docker

**Quick start (production):**
```bash
make env          # creates .env from .env.example
make build        # build both images
make up           # start stack at http://localhost
make logs         # tail logs
make down         # stop stack
```

**Development with hot-reload (Docker):**
```bash
make dev-docker   # mounts source as volumes; saves database in a named volume
```

**Convenience targets:** `make help` lists all targets.

## Environment

Copy `.env.example` to `.env` and edit. Key variables:

```
ENV=development           # "production" disables Swagger UI
LLM_URL=http://localhost:8080/v1/chat/completions
LLM_MODEL=local-model
TAX_UPDATE_INTERVAL_HOURS=24
RATE_LIMIT_RPM=120
LOG_LEVEL=INFO
```

Without a running LLM the RAG chat returns a clear error instead of replying.

## Architecture

**Monorepo** with `backend-python/` (FastAPI on Python) and `frontend/` (React 19 + Vite + Tailwind CSS).

### Backend (`backend-python/`)

| File / Module | Role |
|---|---|
| `main.py` | FastAPI factory: lifespan, middleware stack, exception handlers, static serving |
| `config/settings.py` | Centralised env-var config (import from here, not `os.getenv`) |
| `middleware.py` | `RequestIDMiddleware`, `LoggingMiddleware`, `SecurityHeadersMiddleware`, `RateLimitMiddleware` |
| `database.py` | SQLite (WAL mode) via `sqlite3`; tables: `tax_profiles`, `tax_filings`, `uploaded_documents`, `tax_rules`, `tax_corpus`, `tax_updates`, `tax_update_status`, `regulation_changes` |
| `routes/api.py` | All REST endpoints under `/api/v1/` |
| `services/calculation_engine.py` | Tax logic: reads slabs/limits from DB (cached); `invalidate_rules_cache()` called after LLM-detected rule changes |
| `services/rag_service.py` | Keyword search over DB corpus + LLM Q&A; `invalidate_corpus_cache()` after new sections are added |
| `services/regulation_analyzer.py` | Sends fetched articles to LLM; extracts structured changes; applies them to DB; invalidates caches |
| `services/tax_updater.py` | Web search (DuckDuckGo) → saves to `tax_updates` table → triggers `regulation_analyzer` |
| `services/update_scheduler.py` | APScheduler wrapper (runs on startup if stale, then hourly) |
| `services/document_parser.py` | Form 16 / Form 26AS / AIS parsing + three-way reconciliation |
| `services/discovery_engine.py` | Identifies missed deductions from profile signals |
| `services/ai_review_service.py` | ITR confidence scoring and AI narrative |
| `config/taxCorpus.json` | Seed data for `tax_rules` and `tax_corpus` tables (loaded once on first `init_db()`) |

**Persistence:** SQLite at `backend-python/data/tax_agent.db`. Docker mounts `tax_data` volume to `/app/data`.

**Regulation intelligence flow:**
1. Scheduler triggers `tax_updater.run_update()` every 24h
2. DuckDuckGo results saved to `tax_updates` table
3. `regulation_analyzer.analyze_and_apply_new_updates()` sends each unanalyzed article to the LLM
4. LLM returns structured JSON with detected changes
5. Scalar changes (deduction limits, standard deduction, rebate thresholds, cess) are applied directly to the `tax_rules` row in DB
6. New sections are upserted into `tax_corpus`
7. Module-level caches in `calculation_engine` and `rag_service` are invalidated
8. Dashboard `RegulationChanges` component shows detected changes

### Frontend (`frontend/src/`)

| Component | Tab | Purpose |
|---|---|---|
| `Dashboard.jsx` | Dashboard | Overview, filings table, Live Tax Law Intelligence, AI Regulation Intelligence panel, regime comparison, compliance alerts |
| `TaxFiling.jsx` | File Taxes | Multi-step filing flow (income → deductions → tax paid → results); ITR form suggestion; Save to Records |
| `Chatbot.jsx` | Tax Advisor | RAG-powered Q&A (red error bubble when LLM offline) + scenario simulator |
| `Reports.jsx` | Reports | Recharts bar chart, summary cards, filings table, CSV export |
| `Settings.jsx` | Settings | LLM endpoint config + test, corpus refresh status, GDPR/DPDP erasure |

### Tax Computation Rules (FY 2025-26 / AY 2026-27)

**New regime:** ₹75,000 standard deduction; slabs 0/5/10/15/20/25/30% for bands up to ₹4L/8L/12L/16L/20L/24L/24L+; 87A rebate (up to ₹60,000) if taxable income ≤ ₹12L; no Chapter VI-A deductions.

**Old regime:** ₹50,000 standard deduction; age-based slabs (general / senior ≥60 / super-senior ≥80); full Chapter VI-A deductions (80C ₹1.5L, 80D up to ₹1L, 80CCD(1B) ₹50K extra, etc.).

Both regimes always computed; API returns the optimal regime with savings delta. **All limits are DB-driven** — the LLM can update them automatically when new regulations are detected.

### ITR Form Selection Logic

- **ITR-3**: Business/professional income detected
- **ITR-2**: Capital gains (STCG/LTCG), income > ₹50L, or house property loss
- **ITR-1**: Salary only, income ≤ ₹50L, no capital gains

### Key API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/tax/optimize` | Regime recommendation + full comparison |
| POST | `/api/v1/tax/calculate` | Detailed tax calculation |
| POST | `/api/v1/documents/parse` | Parse uploaded tax document (Form 16/26AS/AIS) |
| POST | `/api/v1/deductions/discover` | Find missed deductions |
| POST | `/api/v1/chat` | RAG Q&A |
| POST | `/api/v1/scenarios/simulate` | What-if scenario simulation |
| POST | `/api/v1/itr/generate` | Generate ITR JSON for e-filing |
| GET/POST/DELETE | `/api/v1/memory/*` | Session profile read/write/clear |
| GET | `/api/v1/reports/filings` | List saved filing records |
| POST | `/api/v1/reports/filings` | Add a filing record |
| GET | `/api/v1/reports/summary` | Aggregate summary + by-year breakdown |
| GET | `/api/v1/reports/export` | CSV export of filings |
| GET | `/api/v1/tax-rules` | Current tax rules from DB |
| GET | `/api/v1/corpus/sections` | Active corpus sections from DB |
| GET | `/api/v1/corpus/status` | Web-update status |
| POST | `/api/v1/corpus/refresh` | Trigger background web fetch |
| GET | `/api/v1/regulation-changes` | LLM-detected regulation changes |
| GET | `/api/v1/regulation-changes/summary` | Counts + recent changes |
| POST | `/api/v1/regulation-changes/analyze` | Trigger LLM analysis of unanalyzed articles |
| GET/POST | `/api/v1/llm/config` | Read/write LLM endpoint config |
| POST | `/api/v1/llm/test` | Test LLM reachability |
| GET | `/health` | Health check (status, version, env, db) |
