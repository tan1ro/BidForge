import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from audit import log_audit
from auth import UserPrincipal, UserRole, require_roles
from database import rfqs_collection, bids_collection, activity_logs_collection
from models import (
    RFQCreate, RFQUpdate, RFQResponse, BidCreate, BidResponse,
    ActivityLogResponse, AuctionStatus, ExtensionTriggerType,
)
from ws_manager import ws_manager

router = APIRouter(prefix="/api", tags=["RFQ & Auction"])


# ─── Helpers ───

def serialize_rfq(doc: dict, lowest_bid=None, total_bids=0, winner_carrier=None, winning_bid_total=None) -> dict:
    return RFQResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        reference_id=doc["reference_id"],
        bid_start_time=doc["bid_start_time"],
        bid_close_time=doc["bid_close_time"],
        current_close_time=doc["current_close_time"],
        forced_close_time=doc["forced_close_time"],
        pickup_date=doc["pickup_date"],
        trigger_window_minutes=doc["trigger_window_minutes"],
        extension_duration_minutes=doc["extension_duration_minutes"],
        extension_trigger=doc["extension_trigger"],
        material=doc.get("material", ""),
        quantity=doc.get("quantity", ""),
        pickup_location=doc.get("pickup_location", ""),
        delivery_location=doc.get("delivery_location", ""),
        auction_type=doc.get("auction_type", "Reverse Auction (lowest wins)"),
        starting_price=doc.get("starting_price", 0),
        minimum_decrement=doc.get("minimum_decrement", 0),
        technical_specs_attachment=doc.get("technical_specs_attachment", ""),
        technical_specs_file_name=doc.get("technical_specs_file_name", ""),
        technical_specs_content_type=doc.get("technical_specs_content_type", ""),
        technical_specs_file_base64=doc.get("technical_specs_file_base64", ""),
        loading_unloading_notes=doc.get("loading_unloading_notes", ""),
        status=doc["status"],
        lowest_bid=lowest_bid,
        total_bids=total_bids,
        winner_carrier=winner_carrier,
        winning_bid_total=winning_bid_total,
        created_at=doc["created_at"],
    ).model_dump()


def serialize_bid(doc: dict) -> dict:
    return BidResponse(
        id=str(doc["_id"]),
        rfq_id=str(doc["rfq_id"]),
        carrier_name=doc["carrier_name"],
        freight_charges=doc["freight_charges"],
        origin_charges=doc["origin_charges"],
        destination_charges=doc["destination_charges"],
        total_price=doc["total_price"],
        transit_time=doc["transit_time"],
        validity=doc["validity"],
        vehicle_type=doc.get("vehicle_type", ""),
        capacity_tons=doc.get("capacity_tons", 0),
        insurance_included=doc.get("insurance_included", False),
        rank=doc["rank"],
        created_at=doc["created_at"],
    ).model_dump()


def serialize_log(doc: dict) -> dict:
    return ActivityLogResponse(
        id=str(doc["_id"]),
        rfq_id=str(doc["rfq_id"]),
        event_type=doc["event_type"],
        description=doc["description"],
        metadata=doc.get("metadata", {}),
        created_at=doc["created_at"],
    ).model_dump()


def _ensure_tz(dt):
    """Ensure a datetime is timezone-aware (UTC)."""
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def compute_status(doc: dict) -> str:
    """Compute real-time auction status based on current time."""
    now = datetime.now(timezone.utc)
    bid_start = _ensure_tz(doc["bid_start_time"])
    current_close = _ensure_tz(doc["current_close_time"])
    forced_close = _ensure_tz(doc["forced_close_time"])

    if doc.get("is_paused") and now < forced_close:
        return AuctionStatus.PAUSED
    elif now < bid_start:
        return AuctionStatus.UPCOMING
    elif now >= forced_close:
        return AuctionStatus.FORCE_CLOSED
    elif now >= current_close:
        return AuctionStatus.CLOSED
    else:
        return AuctionStatus.ACTIVE


async def recalculate_ranks(rfq_id: str):
    """Recalculate all bid ranks for an RFQ based on total_price (ascending).
    For ties, the earlier bid gets the better rank.
    """
    cursor = bids_collection.find({"rfq_id": rfq_id}).sort(
        [("total_price", 1), ("created_at", 1)]
    )
    rank = 1
    async for bid in cursor:
        await bids_collection.update_one(
            {"_id": bid["_id"]},
            {"$set": {"rank": rank}}
        )
        rank += 1


async def log_activity(rfq_id: str, event_type: str, description: str, metadata: dict = None):
    """Log an activity event for an RFQ."""
    await activity_logs_collection.insert_one({
        "rfq_id": rfq_id,
        "event_type": event_type,
        "description": description,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc),
    })


def _pagination_meta(items: list, total: int, page: int, page_size: int):
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": page * page_size < total,
    }


async def check_and_extend_auction(rfq_id: str, rfq: dict, trigger_reason: str):
    """Check if auction should be extended and apply extension if needed.
    
    IMPORTANT: Always re-fetch the RFQ to get the latest current_close_time,
    in case it was already extended during this request cycle.
    """
    # Re-fetch to get latest state (avoids stale data race condition)
    fresh_rfq = await rfqs_collection.find_one({"_id": rfq["_id"]})
    if not fresh_rfq:
        return False

    now = datetime.now(timezone.utc)
    current_close = _ensure_tz(fresh_rfq["current_close_time"])
    forced_close = _ensure_tz(fresh_rfq["forced_close_time"])
    trigger_window = fresh_rfq["trigger_window_minutes"]
    extension_duration = fresh_rfq["extension_duration_minutes"]

    # Check if we're within the trigger window
    window_start = current_close - timedelta(minutes=trigger_window)

    if window_start <= now <= current_close:
        # Calculate new close time
        new_close = current_close + timedelta(minutes=extension_duration)

        # Never exceed forced close time
        if new_close > forced_close:
            new_close = forced_close

        if new_close > current_close:
            await rfqs_collection.update_one(
                {"_id": rfq["_id"]},
                {"$set": {"current_close_time": new_close}}
            )
            await log_activity(
                rfq_id,
                "time_extended",
                f"Auction extended by {extension_duration} min. New close: {new_close.strftime('%d %b %Y, %I:%M %p')} UTC. Reason: {trigger_reason}",
                {"old_close": current_close.isoformat(), "new_close": new_close.isoformat(), "reason": trigger_reason}
            )
            return True
    return False


async def _update_status_with_logging(doc: dict):
    """Compute status and log transitions for automatic closures."""
    old_status = doc.get("status", "")
    new_status = compute_status(doc)

    if old_status != new_status:
        doc["status"] = new_status
        await rfqs_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": new_status}}
        )

        rfq_id = str(doc["_id"])

        # Log automatic status transitions
        if new_status == AuctionStatus.CLOSED and old_status == AuctionStatus.ACTIVE:
            await log_activity(
                rfq_id,
                "auction_closed",
                f"Auction closed automatically at scheduled close time.",
                {"old_status": old_status, "new_status": new_status}
            )
        elif new_status == AuctionStatus.FORCE_CLOSED and old_status in [AuctionStatus.ACTIVE, AuctionStatus.CLOSED, AuctionStatus.PAUSED]:
            await log_activity(
                rfq_id,
                "auction_closed",
                f"Auction force-closed at hard deadline.",
                {"old_status": old_status, "new_status": new_status}
            )
        elif new_status == AuctionStatus.ACTIVE and old_status == AuctionStatus.UPCOMING:
            await log_activity(
                rfq_id,
                "auction_started",
                f"Auction is now active and accepting bids.",
                {"old_status": old_status, "new_status": new_status}
            )
    else:
        doc["status"] = new_status

    return new_status


async def _compute_winner(rfq_id: str, status: str):
    if status not in [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]:
        return None, None
    winner_bid = await bids_collection.find_one(
        {"rfq_id": rfq_id}, sort=[("total_price", 1), ("created_at", 1)]
    )
    if not winner_bid:
        return None, None
    return winner_bid.get("carrier_name"), winner_bid.get("total_price")


def _bucket_from_datetime(dt: datetime, period: str) -> str:
    dt = _ensure_tz(dt)
    if period == "week":
        year, week, _ = dt.isocalendar()
        return f"{year}-W{week:02d}"
    if period == "month":
        return f"{dt.year}-{dt.month:02d}"
    return dt.strftime("%Y-%m-%d")


def _is_editable_window_open(rfq: dict, now: datetime, total_bids: int) -> bool:
    """Allow edits/pauses before first bid and within configured editable window."""
    if total_bids > 0:
        return False
    bid_start = _ensure_tz(rfq["bid_start_time"])
    created_at = _ensure_tz(rfq["created_at"])
    within_first_15_minutes = now <= created_at + timedelta(minutes=15)
    return now < bid_start or within_first_15_minutes


# ─── RFQ Routes ───

@router.post("/rfqs", response_model=dict)
async def create_rfq(
    rfq: RFQCreate,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    """Create a new RFQ with British Auction configuration."""
    # Validation
    if rfq.bid_start_time >= rfq.bid_close_time:
        raise HTTPException(400, "Bid start time must be before bid close time")
    if rfq.forced_close_time <= rfq.bid_close_time:
        raise HTTPException(400, "Forced close time must be later than bid close time")
    if rfq.pickup_date <= rfq.bid_start_time:
        raise HTTPException(400, "Pickup date must be after bid start time")
    if rfq.starting_price <= 0:
        raise HTTPException(400, "Starting price must be greater than zero")
    if rfq.minimum_decrement < 0:
        raise HTTPException(400, "Minimum decrement cannot be negative")

    ref_id = f"RFQ-{uuid.uuid4().hex[:8].upper()}"

    doc = {
        "name": rfq.name,
        "reference_id": ref_id,
        "material": rfq.material,
        "quantity": rfq.quantity,
        "pickup_location": rfq.pickup_location,
        "delivery_location": rfq.delivery_location,
        "bid_start_time": rfq.bid_start_time,
        "bid_close_time": rfq.bid_close_time,
        "current_close_time": rfq.bid_close_time,  # starts same as bid_close_time
        "forced_close_time": rfq.forced_close_time,
        "pickup_date": rfq.pickup_date,
        "trigger_window_minutes": rfq.trigger_window_minutes,
        "extension_duration_minutes": rfq.extension_duration_minutes,
        "extension_trigger": rfq.extension_trigger,
        "auction_type": rfq.auction_type,
        "starting_price": rfq.starting_price,
        "minimum_decrement": rfq.minimum_decrement,
        "technical_specs_attachment": rfq.technical_specs_attachment,
        "technical_specs_file_name": rfq.technical_specs_file_name,
        "technical_specs_content_type": rfq.technical_specs_content_type,
        "technical_specs_file_base64": rfq.technical_specs_file_base64,
        "loading_unloading_notes": rfq.loading_unloading_notes,
        "is_paused": False,
        "status": AuctionStatus.UPCOMING,
        "created_at": datetime.now(timezone.utc),
    }

    result = await rfqs_collection.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Compute the actual status (might be active if start is in the past)
    await _update_status_with_logging(doc)

    await log_activity(
        str(result.inserted_id),
        "rfq_created",
        f"RFQ '{rfq.name}' ({ref_id}) created with British Auction enabled."
    )
    await log_audit(
        action="rfq_created",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=str(result.inserted_id),
    )

    return serialize_rfq(doc)


@router.get("/rfqs")
async def list_rfqs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    """List all RFQs with current status, lowest bid, and total bids."""
    rfqs = []
    if status == AuctionStatus.CLOSED:
        query = {"status": {"$in": [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]}}
    elif status:
        query = {"status": status}
    else:
        query = {}
    total = await rfqs_collection.count_documents(query)
    cursor = rfqs_collection.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)

    async for doc in cursor:
        # Update status dynamically with logging
        await _update_status_with_logging(doc)

        rfq_id = str(doc["_id"])

        # Get bid stats
        total_bids = await bids_collection.count_documents({"rfq_id": rfq_id})
        lowest_bid_doc = await bids_collection.find_one(
            {"rfq_id": rfq_id}, sort=[("total_price", 1)]
        )
        lowest_bid = lowest_bid_doc["total_price"] if lowest_bid_doc else None
        winner_carrier, winning_bid_total = await _compute_winner(rfq_id, doc["status"])
        rfqs.append(serialize_rfq(doc, lowest_bid, total_bids, winner_carrier, winning_bid_total))

    await log_audit(
        action="rfq_list_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        metadata={"page": page, "page_size": page_size, "status": status},
    )
    return _pagination_meta(rfqs, total, page, page_size)


@router.get("/rfqs/{rfq_id}")
async def get_rfq(
    rfq_id: str,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    """Get detailed RFQ information."""
    try:
        doc = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")

    if not doc:
        raise HTTPException(404, "RFQ not found")

    await _update_status_with_logging(doc)

    rfq_id_str = str(doc["_id"])
    total_bids = await bids_collection.count_documents({"rfq_id": rfq_id_str})
    lowest_bid_doc = await bids_collection.find_one(
        {"rfq_id": rfq_id_str}, sort=[("total_price", 1)]
    )
    lowest_bid = lowest_bid_doc["total_price"] if lowest_bid_doc else None
    winner_carrier, winning_bid_total = await _compute_winner(rfq_id_str, doc["status"])

    await log_audit(
        action="rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
    )
    return serialize_rfq(doc, lowest_bid, total_bids, winner_carrier, winning_bid_total)


@router.get("/metrics/bids-per-rfq")
async def metrics_bids_per_rfq(
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    rows = []
    cursor = rfqs_collection.find({}).sort("created_at", -1)
    async for doc in cursor:
        rfq_id = str(doc["_id"])
        bids_count = await bids_collection.count_documents({"rfq_id": rfq_id})
        rows.append({
            "rfq_id": rfq_id,
            "reference_id": doc.get("reference_id"),
            "name": doc.get("name"),
            "status": doc.get("status"),
            "bids_count": bids_count,
        })
    await log_audit(
        action="metrics_bids_per_rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
    )
    return {"items": rows, "total": len(rows)}


@router.get("/metrics/avg-bids")
async def metrics_avg_bids(
    period: str = Query("day", pattern="^(day|week|month)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    grouped = defaultdict(lambda: {"rfq_count": 0, "bids_count": 0})
    cursor = rfqs_collection.find({})
    async for doc in cursor:
        rfq_id = str(doc["_id"])
        bucket = _bucket_from_datetime(doc.get("created_at", datetime.now(timezone.utc)), period)
        auction_type = doc.get("auction_type", "Reverse Auction (lowest wins)")
        key = (auction_type, bucket)
        grouped[key]["rfq_count"] += 1
        grouped[key]["bids_count"] += await bids_collection.count_documents({"rfq_id": rfq_id})
    items = []
    for (auction_type, bucket), values in sorted(grouped.items(), key=lambda x: (x[0][1], x[0][0])):
        rfq_count = values["rfq_count"]
        bids_count = values["bids_count"]
        items.append({
            "auction_type": auction_type,
            "period_bucket": bucket,
            "rfq_count": rfq_count,
            "bids_count": bids_count,
            "avg_bids": round(bids_count / rfq_count, 2) if rfq_count else 0,
        })
    await log_audit(
        action="metrics_avg_bids_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
        metadata={"period": period},
    )
    return {"period": period, "items": items}


@router.get("/metrics/winning-price-trend")
async def metrics_winning_price_trend(
    period: str = Query("day", pattern="^(day|week|month)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    grouped = defaultdict(list)
    cursor = rfqs_collection.find({"status": {"$in": [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]}})
    async for doc in cursor:
        rfq_id = str(doc["_id"])
        winner_bid = await bids_collection.find_one(
            {"rfq_id": rfq_id}, sort=[("total_price", 1), ("created_at", 1)]
        )
        if not winner_bid:
            continue
        bucket = _bucket_from_datetime(doc.get("current_close_time"), period)
        grouped[bucket].append(float(winner_bid["total_price"]))
    items = []
    for bucket in sorted(grouped.keys()):
        prices = grouped[bucket]
        items.append({
            "period_bucket": bucket,
            "avg_winning_price": round(sum(prices) / len(prices), 2),
            "min_winning_price": min(prices),
            "max_winning_price": max(prices),
            "closed_rfq_count": len(prices),
        })
    await log_audit(
        action="metrics_winning_price_trend_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
        metadata={"period": period},
    )
    return {"period": period, "items": items}


@router.get("/metrics/extensions-per-rfq")
async def metrics_extensions_per_rfq(
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    extension_counts = defaultdict(int)
    cursor = activity_logs_collection.find({"event_type": "time_extended"})
    async for log in cursor:
        extension_counts[log["rfq_id"]] += 1
    items = []
    rfq_cursor = rfqs_collection.find({}).sort("created_at", -1)
    async for doc in rfq_cursor:
        rfq_id = str(doc["_id"])
        items.append({
            "rfq_id": rfq_id,
            "reference_id": doc.get("reference_id"),
            "name": doc.get("name"),
            "status": doc.get("status"),
            "extension_count": extension_counts.get(rfq_id, 0),
        })
    await log_audit(
        action="metrics_extensions_per_rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
    )
    return {"items": items, "total": len(items)}


@router.delete("/rfqs/{rfq_id}")
async def delete_rfq(
    rfq_id: str,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    """Delete an RFQ and all its associated bids and activity logs."""
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")

    if not rfq:
        raise HTTPException(404, "RFQ not found")

    # Delete all associated data
    await bids_collection.delete_many({"rfq_id": rfq_id})
    await activity_logs_collection.delete_many({"rfq_id": rfq_id})
    await rfqs_collection.delete_one({"_id": ObjectId(rfq_id)})
    await log_audit(
        action="rfq_deleted",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
    )

    return {"message": f"RFQ '{rfq['name']}' and all associated data deleted successfully"}


@router.patch("/rfqs/{rfq_id}", response_model=dict)
async def update_rfq(
    rfq_id: str,
    updates: RFQUpdate,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    """Update RFQ details before bidding starts / allowed edit window."""
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not rfq:
        raise HTTPException(404, "RFQ not found")

    total_bids = await bids_collection.count_documents({"rfq_id": rfq_id})
    now = datetime.now(timezone.utc)
    if not _is_editable_window_open(rfq, now, total_bids):
        raise HTTPException(400, "RFQ can only be edited before bidding starts or within 15 minutes of creation, and only when no bids exist")

    payload = updates.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(400, "No fields provided for update")

    merged = {**rfq, **payload}
    bid_start = _ensure_tz(merged["bid_start_time"])
    bid_close = _ensure_tz(merged["bid_close_time"])
    forced_close = _ensure_tz(merged["forced_close_time"])
    pickup_date = _ensure_tz(merged["pickup_date"])
    if bid_start >= bid_close:
        raise HTTPException(400, "Bid start time must be before bid close time")
    if forced_close <= bid_close:
        raise HTTPException(400, "Forced close time must be later than bid close time")
    if pickup_date <= bid_start:
        raise HTTPException(400, "Pickup date must be after bid start time")
    if float(merged.get("starting_price", 0) or 0) <= 0:
        raise HTTPException(400, "Starting price must be greater than zero")
    if float(merged.get("minimum_decrement", 0) or 0) < 0:
        raise HTTPException(400, "Minimum decrement cannot be negative")

    await rfqs_collection.update_one({"_id": rfq["_id"]}, {"$set": payload})
    updated = await rfqs_collection.find_one({"_id": rfq["_id"]})
    await _update_status_with_logging(updated)
    await log_activity(
        rfq_id,
        "rfq_updated",
        f"RFQ configuration updated by buyer. Updated fields: {', '.join(sorted(payload.keys()))}",
        {"updated_fields": sorted(payload.keys())},
    )
    await log_audit(
        action="rfq_updated",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"updated_fields": sorted(payload.keys())},
    )
    total_bids = await bids_collection.count_documents({"rfq_id": rfq_id})
    lowest_bid_doc = await bids_collection.find_one({"rfq_id": rfq_id}, sort=[("total_price", 1)])
    lowest_bid = lowest_bid_doc["total_price"] if lowest_bid_doc else None
    return serialize_rfq(updated, lowest_bid, total_bids)


@router.post("/rfqs/{rfq_id}/pause", response_model=dict)
async def pause_rfq(
    rfq_id: str,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    """Pause auction before bidding starts / allowed edit window."""
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not rfq:
        raise HTTPException(404, "RFQ not found")

    total_bids = await bids_collection.count_documents({"rfq_id": rfq_id})
    now = datetime.now(timezone.utc)
    if not _is_editable_window_open(rfq, now, total_bids):
        raise HTTPException(400, "RFQ can only be paused before bidding starts or within 15 minutes of creation, and only when no bids exist")

    await rfqs_collection.update_one({"_id": rfq["_id"]}, {"$set": {"is_paused": True, "status": AuctionStatus.PAUSED}})
    paused = await rfqs_collection.find_one({"_id": rfq["_id"]})
    await log_activity(rfq_id, "auction_paused", "Auction paused by buyer before bidding start window.")
    await log_audit(
        action="rfq_paused",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
    )
    lowest_bid_doc = await bids_collection.find_one({"rfq_id": rfq_id}, sort=[("total_price", 1)])
    lowest_bid = lowest_bid_doc["total_price"] if lowest_bid_doc else None
    return serialize_rfq(paused, lowest_bid, total_bids)


# ─── Bid Routes ───

@router.post("/rfqs/{rfq_id}/bids")
async def submit_bid(
    rfq_id: str,
    bid: BidCreate,
    user: UserPrincipal = Depends(require_roles([UserRole.SUPPLIER])),
):
    """Submit a bid for an RFQ. Handles auction extension logic.
    
    If the same carrier submits again, their previous bid is updated (revised).
    """
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")

    if not rfq:
        raise HTTPException(404, "RFQ not found")

    # Update status
    rfq["status"] = compute_status(rfq)
    if rfq["status"] not in [AuctionStatus.ACTIVE]:
        raise HTTPException(400, f"Auction is not active (status: {rfq['status']}). Cannot submit bid.")

    # Validate bid amounts
    if bid.freight_charges < 0 or bid.origin_charges < 0 or bid.destination_charges < 0:
        raise HTTPException(400, "Charge values cannot be negative")

    total_price = round(bid.freight_charges + bid.origin_charges + bid.destination_charges, 2)

    if total_price <= 0:
        raise HTTPException(400, "Total bid amount must be greater than zero")

    # Get old L1 before modifying bids
    old_l1 = await bids_collection.find_one(
        {"rfq_id": rfq_id}, sort=[("total_price", 1)]
    )
    old_l1_carrier = old_l1["carrier_name"] if old_l1 else None
    starting_price = float(rfq.get("starting_price", 0) or 0)
    minimum_decrement = float(rfq.get("minimum_decrement", 0) or 0)

    if starting_price > 0 and old_l1 is None and total_price > starting_price:
        raise HTTPException(400, f"Bid must be less than or equal to starting price ₹{starting_price:,.2f}")
    if old_l1 is not None and minimum_decrement > 0:
        required_max = round(float(old_l1["total_price"]) - minimum_decrement, 2)
        if total_price > required_max:
            raise HTTPException(
                400,
                f"Bid must beat current lowest by at least ₹{minimum_decrement:,.2f}. Maximum allowed: ₹{required_max:,.2f}",
            )

    # Get old ranks for rank-change detection
    old_ranks = {}
    async for b in bids_collection.find({"rfq_id": rfq_id}).sort("total_price", 1):
        old_ranks[b["carrier_name"]] = b["rank"]

    # Check if this carrier already has a bid — if so, update (revise) it
    existing_bid = await bids_collection.find_one({
        "rfq_id": rfq_id,
        "carrier_name": bid.carrier_name,
    })

    is_revision = False
    old_total = None

    if existing_bid:
        is_revision = True
        old_total = existing_bid["total_price"]
        await bids_collection.update_one(
            {"_id": existing_bid["_id"]},
            {"$set": {
                "freight_charges": bid.freight_charges,
                "origin_charges": bid.origin_charges,
                "destination_charges": bid.destination_charges,
                "total_price": total_price,
                "transit_time": bid.transit_time,
                "validity": bid.validity,
                "vehicle_type": bid.vehicle_type,
                "capacity_tons": bid.capacity_tons,
                "insurance_included": bid.insurance_included,
                "created_at": datetime.now(timezone.utc),
            }}
        )
        bid_id = existing_bid["_id"]
    else:
        bid_doc = {
            "rfq_id": rfq_id,
            "carrier_name": bid.carrier_name,
            "freight_charges": bid.freight_charges,
            "origin_charges": bid.origin_charges,
            "destination_charges": bid.destination_charges,
            "total_price": total_price,
            "transit_time": bid.transit_time,
            "validity": bid.validity,
            "vehicle_type": bid.vehicle_type,
            "capacity_tons": bid.capacity_tons,
            "insurance_included": bid.insurance_included,
            "rank": 0,  # will be recalculated
            "created_at": datetime.now(timezone.utc),
        }
        result = await bids_collection.insert_one(bid_doc)
        bid_id = result.inserted_id

    # Recalculate ranks
    await recalculate_ranks(rfq_id)

    # Log bid submission
    if is_revision:
        await log_activity(
            rfq_id,
            "bid_submitted",
            f"{bid.carrier_name} revised bid: ₹{total_price:,.2f} (was ₹{old_total:,.2f}). Freight: ₹{bid.freight_charges:,.2f}, Origin: ₹{bid.origin_charges:,.2f}, Dest: ₹{bid.destination_charges:,.2f}, Vehicle: {bid.vehicle_type or 'N/A'}, Capacity: {bid.capacity_tons:g} tons, Insurance: {'Yes' if bid.insurance_included else 'No'}",
            {"carrier": bid.carrier_name, "total_price": total_price, "old_total": old_total, "is_revision": True}
        )
    else:
        await log_activity(
            rfq_id,
            "bid_submitted",
            f"{bid.carrier_name} submitted bid: ₹{total_price:,.2f} (Freight: ₹{bid.freight_charges:,.2f}, Origin: ₹{bid.origin_charges:,.2f}, Dest: ₹{bid.destination_charges:,.2f}, Vehicle: {bid.vehicle_type or 'N/A'}, Capacity: {bid.capacity_tons:g} tons, Insurance: {'Yes' if bid.insurance_included else 'No'})",
            {"carrier": bid.carrier_name, "total_price": total_price}
        )

    # Check extension triggers
    trigger = rfq["extension_trigger"]

    if trigger == ExtensionTriggerType.BID_RECEIVED:
        await check_and_extend_auction(rfq_id, rfq, f"Bid received from {bid.carrier_name}")

    elif trigger == ExtensionTriggerType.RANK_CHANGE:
        # Check if any rank changed
        new_ranks = {}
        async for b in bids_collection.find({"rfq_id": rfq_id}).sort("total_price", 1):
            new_ranks[b["carrier_name"]] = b["rank"]
        if new_ranks != old_ranks:
            await check_and_extend_auction(rfq_id, rfq, f"Supplier rank changed after bid from {bid.carrier_name}")

    elif trigger == ExtensionTriggerType.L1_CHANGE:
        # Check if L1 changed
        new_l1 = await bids_collection.find_one(
            {"rfq_id": rfq_id}, sort=[("total_price", 1)]
        )
        new_l1_carrier = new_l1["carrier_name"] if new_l1 else None
        if new_l1_carrier != old_l1_carrier:
            await check_and_extend_auction(rfq_id, rfq, f"L1 changed: {old_l1_carrier} → {new_l1_carrier}")

    # Reload bid with updated rank
    bid_doc = await bids_collection.find_one({"_id": bid_id})
    await ws_manager.broadcast(
        rfq_id,
        {
            "type": "bid_updated",
            "rfq_id": rfq_id,
            "carrier_name": bid.carrier_name,
            "total_price": bid_doc["total_price"],
            "rank": bid_doc["rank"],
        },
    )
    await log_audit(
        action="bid_submitted",
        username=user.username,
        role=user.role.value,
        resource_type="bid",
        resource_id=str(bid_id),
        metadata={"rfq_id": rfq_id, "carrier_name": bid.carrier_name},
    )
    return serialize_bid(bid_doc)


@router.get("/rfqs/{rfq_id}/bids")
async def get_bids(
    rfq_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    """Get all bids for an RFQ sorted by rank (price ascending)."""
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")

    if not rfq:
        raise HTTPException(404, "RFQ not found")

    bids = []
    query = {"rfq_id": rfq_id}
    total = await bids_collection.count_documents(query)
    cursor = bids_collection.find(query).sort(
        [("total_price", 1), ("created_at", 1)]
    ).skip((page - 1) * page_size).limit(page_size)
    async for doc in cursor:
        bids.append(serialize_bid(doc))
    await log_audit(
        action="bids_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"page": page, "page_size": page_size},
    )
    return _pagination_meta(bids, total, page, page_size)


# ─── Activity Log Routes ───

@router.get("/rfqs/{rfq_id}/activity")
async def get_activity(
    rfq_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    """Get activity log for an RFQ."""
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")

    if not rfq:
        raise HTTPException(404, "RFQ not found")

    logs = []
    query = {"rfq_id": rfq_id}
    total = await activity_logs_collection.count_documents(query)
    cursor = activity_logs_collection.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    async for doc in cursor:
        logs.append(serialize_log(doc))
    await log_audit(
        action="activity_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"page": page, "page_size": page_size},
    )
    return _pagination_meta(logs, total, page, page_size)


@router.websocket("/ws/rfqs/{rfq_id}")
async def rfq_socket(websocket: WebSocket, rfq_id: str):
    await ws_manager.connect(rfq_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(rfq_id, websocket)
