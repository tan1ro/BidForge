from datetime import datetime, timezone

from database import audit_logs_collection


async def log_audit(
    action: str,
    username: str,
    role: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    request_id: str | None = None,
):
    data = metadata.copy() if metadata else {}
    if request_id:
        data["request_id"] = request_id
    await audit_logs_collection.insert_one(
        {
            "action": action,
            "username": username,
            "role": role,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "metadata": data,
            "created_at": datetime.now(timezone.utc),
        }
    )
