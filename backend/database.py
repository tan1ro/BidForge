from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.database_name]

# Collections
rfqs_collection = db["rfqs"]
bids_collection = db["bids"]
activity_logs_collection = db["activity_logs"]
audit_logs_collection = db["audit_logs"]
users_collection = db["users"]


async def init_db():
    """Create indexes for better query performance."""
    await bids_collection.create_index("rfq_id")
    await bids_collection.create_index([("rfq_id", 1), ("total_price", 1)])
    await bids_collection.create_index([("rfq_id", 1), ("carrier_name", 1)], unique=True)
    await activity_logs_collection.create_index([("rfq_id", 1), ("created_at", -1)])
    await rfqs_collection.create_index([("created_at", -1)])
    await rfqs_collection.create_index([("status", 1), ("created_at", -1)])
    await rfqs_collection.create_index([("status", 1), ("current_close_time", 1)])
    await rfqs_collection.create_index([("forced_close_time", 1)])
    await audit_logs_collection.create_index([("created_at", -1)])
    await audit_logs_collection.create_index([("action", 1), ("created_at", -1)])
    await users_collection.create_index("username", unique=True)
    await users_collection.create_index("email", unique=True)
