# Tax Me — Indian AI Tax Filing Agent

An AI-powered Indian income tax filing assistant with RAG-based Q&A, automatic regulation tracking, document parsing, and regime optimisation for FY 2025-26 / AY 2026-27.

---

## Features

- **Dual-regime optimisation** — computes both old and new regime in every request and highlights the better option
- **Live regulation intelligence** — DuckDuckGo search fetches new articles every 24 h; an LLM extracts structured rule changes and applies them to the database automatically
- **Document parsing** — upload Form 16, Form 26AS, or AIS; the engine reconciles all three and flags discrepancies
- **Missed deduction discovery** — analyses your income profile to surface 80C / 80D / 80CCD gaps you may have overlooked
- **RAG Tax Advisor** — keyword search over the tax corpus feeds context to the LLM for grounded Q&A and what-if scenario simulation
- **ITR form suggestion** — picks ITR-1 / ITR-2 / ITR-3 based on your income sources
- **Reports & CSV export** — saves filing records; Recharts bar chart; one-click CSV download
- **HTTPS out of the box** — nginx reverse proxy with a self-signed TLS cert; swap in Let's Encrypt for a real domain in minutes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI (Python), APScheduler |
| Database | SQLite (WAL mode) |
| AI / RAG | Any OpenAI-compatible LLM endpoint (LM Studio, Ollama, etc.) |
| Proxy | nginx |
| Container | Docker + Docker Compose |

---

## Quick Start (local, no Docker)

**Prerequisites:** Node 18+, Python 3.11+

```bash
# 1. Install all dependencies
npm run install-all

# 2. Copy and edit environment variables
cp .env.example .env

# 3. Run backend + frontend concurrently
npm run dev
```

- Frontend: http://localhost:5173  
- Backend API / Swagger: http://localhost:5000/docs  

> The app works without an LLM — RAG chat returns a clear error message instead of failing silently.

---

## Docker (production, with HTTPS)

```bash
cp .env.example .env        # edit LLM_URL, LLM_MODEL, ENV=production
make build                  # build all three images
make up                     # start stack in the background
```

Open **https://localhost** — accept the self-signed certificate warning.  
Use `make logs` to tail output and `make down` to stop.

```
Internet
   ├─ :80  → nginx-proxy  (redirects to HTTPS)
   └─ :443 → nginx-proxy  (TLS termination)
                 │
             frontend:80  (nginx — React SPA + /api proxy)
                 │
             backend:5000  (FastAPI + SQLite on named volume)
```

---

## Environment Variables

Copy `.env.example` to `.env` and edit:

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | `production` disables Swagger UI |
| `LLM_URL` | `http://localhost:8080/v1/chat/completions` | OpenAI-compatible chat endpoint |
| `LLM_MODEL` | `local-model` | Model name sent in requests |
| `TAX_UPDATE_INTERVAL_HOURS` | `24` | How often to re-fetch regulation articles |
| `RATE_LIMIT_RPM` | `120` | Requests per minute per IP |
| `LOG_LEVEL` | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |

---

## Deploying to AWS (EC2)

> Runs the Docker stack on a single `t3.small` instance (~$15/month).  
> For full steps run `make deploy-info`.

**1. Push to GitHub, then launch an EC2 instance:**

| Setting | Value |
|---|---|
| AMI | Ubuntu Server 22.04 LTS |
| Instance type | `t3.small` |
| Security Group | Inbound: SSH (22), HTTP (80), HTTPS (443) |

Allocate an **Elastic IP** and associate it with the instance for a stable address.

**2. Bootstrap the server:**

```bash
# SSH into the instance
ssh -i key.pem ubuntu@<elastic-ip>

# Run the bootstrap script (installs Docker, clones repo, sets up app)
bash <(curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy.sh) \
     https://github.com/<you>/<repo>.git
```

**3. Edit `.env` and start:**

```bash
sudo nano /opt/tax-agent/.env
cd /opt/tax-agent && sudo make build && sudo make up
```

Open `https://<elastic-ip>` — the browser will warn about the self-signed certificate; click **Advanced → Proceed**.

**Upgrade to a real certificate:** point a [DuckDNS](https://www.duckdns.org) subdomain at your Elastic IP and swap in certbot + Let's Encrypt.

---

## Key API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/tax/optimize` | Regime recommendation + full comparison |
| `POST` | `/api/v1/tax/calculate` | Detailed tax breakdown |
| `POST` | `/api/v1/documents/parse` | Parse Form 16 / 26AS / AIS |
| `POST` | `/api/v1/deductions/discover` | Find missed deductions |
| `POST` | `/api/v1/chat` | RAG Q&A |
| `POST` | `/api/v1/scenarios/simulate` | What-if scenario simulation |
| `POST` | `/api/v1/itr/generate` | Generate ITR JSON for e-filing |
| `GET`  | `/api/v1/reports/filings` | Saved filing records |
| `GET`  | `/api/v1/reports/export` | CSV export |
| `GET`  | `/api/v1/regulation-changes` | LLM-detected rule changes |
| `POST` | `/api/v1/corpus/refresh` | Trigger background web fetch |
| `GET`  | `/health` | Health check |

Full interactive docs at `/docs` (development mode only).

---

## Tax Rules (FY 2025-26 / AY 2026-27)

**New regime:** ₹75,000 standard deduction · slabs 0 / 5 / 10 / 15 / 20 / 25 / 30% · 87A rebate (up to ₹60,000) if taxable income ≤ ₹12L · no Chapter VI-A deductions.

**Old regime:** ₹50,000 standard deduction · age-based slabs (general / senior ≥60 / super-senior ≥80) · full Chapter VI-A (80C ₹1.5L, 80D up to ₹1L, 80CCD(1B) ₹50K extra, etc.).

All limits are stored in the database and updated automatically when the LLM detects new regulations.

---

## Makefile Targets

```
make install        Install Python + Node dependencies (local dev)
make dev            Run backend + frontend with hot-reload (local)
make build          Build production Docker images
make up             Start production stack (HTTPS on :443)
make down           Stop stack
make logs           Tail container logs
make ps             Show container status
make dev-docker     Start dev stack with hot-reload volumes
make clean          Remove containers, volumes, dangling images
make deploy-info    Print the EC2 deployment checklist
```
