"""
Centralized configuration — reads from environment variables and .env file.
All os.getenv() calls in the codebase should be replaced with imports from here.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

# ── Runtime ────────────────────────────────────────────────────────────────────

ENV       = os.getenv("ENV", "development")
IS_PROD   = ENV == "production"
PORT      = int(os.getenv("PORT", "5000"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO" if IS_PROD else "DEBUG")

# ── LLM ───────────────────────────────────────────────────────────────────────

LLM_URL   = os.getenv("LLM_URL",   "http://localhost:8080/v1/chat/completions")
LLM_MODEL = os.getenv("LLM_MODEL", "local-model")

# ── Scheduler ─────────────────────────────────────────────────────────────────

TAX_UPDATE_INTERVAL_HOURS = int(os.getenv("TAX_UPDATE_INTERVAL_HOURS", "24"))

# ── Security / CORS ───────────────────────────────────────────────────────────

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _origins_env:
    ALLOWED_ORIGINS: list[str] = [o.strip() for o in _origins_env.split(",") if o.strip()]
elif IS_PROD:
    ALLOWED_ORIGINS = ["http://localhost", "http://frontend"]
else:
    ALLOWED_ORIGINS = ["*"]

# ── Rate limiting (requests per minute per IP) ────────────────────────────────

RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "120"))
