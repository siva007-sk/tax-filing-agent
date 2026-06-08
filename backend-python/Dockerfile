# syntax=docker/dockerfile:1
# ── Base ──────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/root/.local/bin:$PATH"

WORKDIR /app

# ── Dependencies (cached layer) ───────────────────────────────────────────────
FROM base AS deps
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# ── Development ───────────────────────────────────────────────────────────────
FROM base AS development

COPY --from=deps /root/.local /root/.local

# Install watchfiles for --reload support
RUN pip install --user watchfiles==1.0.5

EXPOSE 5000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]

# ── Production ────────────────────────────────────────────────────────────────
FROM base AS production

COPY --from=deps /root/.local /root/.local

# Copy application code (excluding files listed in .dockerignore)
COPY . .

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data

EXPOSE 5000

# Lightweight health probe (no extra deps)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=8)" \
        || exit 1

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "5000", \
     "--workers", "1", \
     "--no-access-log", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
