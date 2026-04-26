import asyncio

from models import AuctionStatus
from database import rfqs_collection
from routes import _update_status_with_logging
from scheduler_lock import try_acquire_scheduler_lock
from ws_manager import ws_manager


class AuctionScheduler:
    def __init__(self):
        self._task = None
        self._running = False

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self):
        while self._running:
            if not await try_acquire_scheduler_lock():
                await asyncio.sleep(2)
                continue
            q = {
                "status": {
                    "$in": [
                        AuctionStatus.UPCOMING.value,
                        AuctionStatus.ACTIVE.value,
                        AuctionStatus.PAUSED.value,
                    ]
                }
            }
            cursor = rfqs_collection.find(q)
            async for doc in cursor:
                old_status = doc.get("status")
                new_status = await _update_status_with_logging(doc)
                if old_status != new_status:
                    await ws_manager.broadcast(
                        str(doc["_id"]),
                        {
                            "type": "status_changed",
                            "rfq_id": str(doc["_id"]),
                            "old_status": old_status,
                            "new_status": new_status,
                        },
                    )
            await asyncio.sleep(5)


auction_scheduler = AuctionScheduler()
