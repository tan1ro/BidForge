import os
import uuid
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from database import distributed_locks_collection

SCHEDULE_LOCK_ID = "auction_scheduler_tick"
LEASE = timedelta(seconds=30)


async def try_acquire_scheduler_lock() -> bool:
    """At most one worker should run the status-advancement loop; Mongo-backed lease."""
    now = datetime.now(timezone.utc)
    holder = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"
    res = await distributed_locks_collection.update_one(
        {
            "_id": SCHEDULE_LOCK_ID,
            "$or": [
                {"expires_at": {"$lt": now}},
            ],
        },
        {"$set": {"expires_at": now + LEASE, "holder": holder, "acquired_at": now}},
    )
    if res.modified_count:
        return True
    try:
        await distributed_locks_collection.insert_one(
            {
                "_id": SCHEDULE_LOCK_ID,
                "expires_at": now + LEASE,
                "holder": holder,
                "acquired_at": now,
            }
        )
        return True
    except DuplicateKeyError:
        return False
