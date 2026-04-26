from collections import defaultdict, deque
from time import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class InMemoryRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, limit_per_minute: int):
        super().__init__(app)
        self.limit_per_minute = limit_per_minute
        self.requests: dict[str, deque] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        key = f"{request.client.host}:{request.url.path}"
        now = time()
        bucket = self.requests[key]
        window_start = now - 60

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= self.limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        bucket.append(now)
        return await call_next(request)
