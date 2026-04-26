from contextlib import asynccontextmanager
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(InMemoryRateLimiter, limit_per_minute=settings.rate_limit_per_minute)
app.add_middleware(RequestIDMiddleware)

app.include_router(router)
app.include_router(auth_router)


@app.get("/")
async def root():
    return {"message": "British Auction RFQ System API", "docs": "/docs"}
