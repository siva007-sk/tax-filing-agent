import logging
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config.settings import ALLOWED_ORIGINS, IS_PROD, LOG_LEVEL, PORT, RATE_LIMIT_RPM
from middleware import (
    LoggingMiddleware,
    RateLimitMiddleware,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
)
from routes.api import router

# ── Logging setup ──────────────────────────────────────────────────────────────

def _setup_logging() -> None:
    logging.basicConfig(
        stream=sys.stdout,
        level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        force=True,
    )
    # Quiet down noisy third-party loggers
    for noisy in ("httpx", "httpcore", "apscheduler", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_setup_logging()
logger = logging.getLogger("app")


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Tax Filing Agent API (env=%s)", "production" if IS_PROD else "development")
    from database import init_db
    init_db()
    logger.info("Database initialised.")

    import asyncio as _asyncio
    from services.update_scheduler import _initial_update, start_scheduler, stop_scheduler
    start_scheduler()
    _asyncio.create_task(_initial_update())

    yield

    stop_scheduler()
    logger.info("Application shutdown complete.")


# ── App factory ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="TAX ME",
    description="AI-powered Indian income tax filing assistant (AY 2026-27).",
    version="2.0.0",
    docs_url="/docs" if not IS_PROD else None,
    redoc_url="/redoc" if not IS_PROD else None,
    lifespan=lifespan,
)

# Middleware — order matters (outermost runs first on request, last on response)
app.add_middleware(RateLimitMiddleware, rpm=RATE_LIMIT_RPM)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


# ── Global exception handlers ──────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Request validation error", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def _generic_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "-")
    logger.exception("Unhandled error [req_id=%s]: %s", req_id, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred. Please try again.",
            "request_id": req_id,
        },
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["ops"])
def health():
    from database import _DB_PATH
    return {
        "status": "healthy",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": app.version,
        "env": "production" if IS_PROD else "development",
        "db": "ok" if _DB_PATH.exists() else "missing",
    }


# ── Static frontend (production only) ─────────────────────────────────────────

_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=not IS_PROD)
