from contextlib import asynccontextmanager
import uuid
from urllib.parse import urlunparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from auth_routes import router as auth_router
from config import settings
from database import init_db
from rate_limit import InMemoryRateLimiter
from routes import router
from scheduler import auction_scheduler


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response


class HttpsEnforcementMiddleware(BaseHTTPMiddleware):
    """Redirect HTTP to HTTPS in production; add HSTS when response is served over TLS."""

    async def dispatch(self, request: Request, call_next):
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "http").lower()
        is_https = proto == "https" or str(request.url.hostname) in ("127.0.0.1", "localhost")
        if settings.is_production and not is_https and request.base_url.hostname not in ("127.0.0.1", "localhost"):
            https_url = urlunparse(
                (
                    "https",
                    request.url.netloc,
                    request.url.path,
                    "",
                    request.url.query,
                    request.url.fragment,
                )
            )
            return RedirectResponse(https_url, status_code=307)
        response = await call_next(request)
        if settings.is_production and is_https:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database indexes on startup."""
    await init_db()
    await auction_scheduler.start()
    yield
    await auction_scheduler.stop()


app = FastAPI(
    title="British Auction RFQ System",
    description="A simplified RFQ system with British Auction–style bidding",
    version="1.0.0",
    lifespan=lifespan,
)

cors_params = {
    "allow_origins": settings.cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.cors_origin_regex:
    cors_params["allow_origin_regex"] = settings.cors_origin_regex
app.add_middleware(CORSMiddleware, **cors_params)
app.add_middleware(InMemoryRateLimiter)
app.add_middleware(HttpsEnforcementMiddleware)
app.add_middleware(RequestIDMiddleware)

app.include_router(router)
app.include_router(auth_router)


@app.get("/")
async def root():
    return {"message": "British Auction RFQ System API", "docs": "/docs"}
