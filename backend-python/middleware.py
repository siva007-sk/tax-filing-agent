"""
Production-grade ASGI middleware:
  - RequestIDMiddleware   — injects X-Request-ID on every request/response
  - LoggingMiddleware     — structured access log (method, path, status, ms)
  - SecurityMiddleware    — standard security response headers
  - RateLimitMiddleware   — in-memory sliding-window rate limiter per IP
"""

import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("api.access")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a short request ID to request state and response headers."""

    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:12]
        request.state.request_id = req_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Structured access log: method + path + status + latency."""

    _SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self._SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1000

        req_id = getattr(request.state, "request_id", "-")
        logger.info(
            '"%s %s" %d %.1fms req_id=%s ip=%s',
            request.method,
            request.url.path,
            response.status_code,
            ms,
            req_id,
            request.client.host if request.client else "-",
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach security headers to every response."""

    _HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        ),
    }

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for header, value in self._HEADERS.items():
            response.headers.setdefault(header, value)
        return response


_ENDPOINT_RPM: dict[str, int] = {
    "/api/v1/chat": 20,
    "/api/v1/documents/parse": 5,
    "/api/v1/ai-review/request": 10,
    "/api/v1/llm/test": 10,
}
_MAX_TRACKED_IPS = 10_000


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window in-memory rate limiter.
    Keyed by (client IP, path) for sensitive endpoints; IP-only for global limit.
    /health is exempt. Bounded memory: evicts oldest IPs beyond _MAX_TRACKED_IPS.
    """

    def __init__(self, app, rpm: int = 120):
        super().__init__(app)
        self._rpm = rpm
        self._window = 60.0
        self._buckets: dict[str, deque] = defaultdict(deque)

    def _check(self, key: str, limit: int, now: float) -> bool:
        """Returns True if rate limit exceeded."""
        bucket = self._buckets[key]
        while bucket and bucket[0] < now - self._window:
            bucket.popleft()
        if len(bucket) >= limit:
            return True
        bucket.append(now)
        return False

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.time()
        path = request.url.path

        # Evict oldest IPs if memory is over the cap
        if len(self._buckets) > _MAX_TRACKED_IPS:
            oldest_keys = list(self._buckets.keys())[:_MAX_TRACKED_IPS // 2]
            for k in oldest_keys:
                del self._buckets[k]

        # Per-endpoint tighter limit for sensitive paths
        endpoint_limit = _ENDPOINT_RPM.get(path)
        if endpoint_limit and self._check(f"{ip}:{path}", endpoint_limit, now):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded for this endpoint. Please slow down."},
                headers={"Retry-After": "60"},
            )

        # Global per-IP limit
        if self._check(ip, self._rpm, now):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down."},
                headers={"Retry-After": "60"},
            )

        return await call_next(request)
