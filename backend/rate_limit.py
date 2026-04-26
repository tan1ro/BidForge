import re
from collections import defaultdict, deque
from time import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from config import settings

_BID_SUBMIT = re.compile(r"^/api/rfqs/[^/]+/bids$")


class InMemoryRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, limit_per_minute: int | None = None, bid_limit_per_minute: int | None = None, max_host_paths: int | None = None):
        super().__init__(app)
        self.limit_per_minute = limit_per_minute if limit_per_minute is not None else settings.rate_limit_per_minute
        self.bid_limit_per_minute = bid_limit_per_minute if bid_limit_per_minute is not None else settings.rate_limit_bid_submit_per_minute
        self._max_host_paths = max_host_paths if max_host_paths is not None else settings.rate_limiter_max_host_paths
        self.requests: dict[str, deque] = defaultdict(deque)
        self._last_sweep = time()

    def _resolve_limit(self, request: Request) -> int:
        if request.method == "POST" and _BID_SUBMIT.match(request.url.path or ""):
            return self.bid_limit_per_minute
        return self.limit_per_minute

    def _sweep_stale(self, now: float) -> None:
        window_start = now - 60
        if now - self._last_sweep < 30 and len(self.requests) < self._max_host_paths * 0.8:
            return
        self._last_sweep = now
        dead: list[str] = []
        for k, bucket in self.requests.items():
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if not bucket:
                dead.append(k)
        for k in dead:
            self.requests.pop(k, None)
        if len(self.requests) > self._max_host_paths:
            for k in list(self.requests.keys())[: max(1, self._max_host_paths // 2)]:
                self.requests.pop(k, None)

    async def dispatch(self, request: Request, call_next):
        now = time()
        self._sweep_stale(now)
        key = f"{request.client.host}:{request.method}:{request.url.path}"
        limit = self._resolve_limit(request)
        window_start = now - 60
        bucket = self.requests[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        bucket.append(now)
        return await call_next(request)
