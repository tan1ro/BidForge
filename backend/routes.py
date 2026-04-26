import uuid
import csv
import io
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from pymongo.errors import DuplicateKeyError, OperationFailure

from audit import log_audit
from auth import UserPrincipal, UserRole, require_roles, user_from_token
from auction_constants import is_british_style_auction
from database import (
    rfqs_collection,
    bids_collection,
    activity_logs_collection,
    bid_revisions_collection,
    users_collection,
)
from metrics_pipeline import (
    pipeline_avg_bids,
    pipeline_bids_per_rfq_metrics,
    pipeline_extension_impact,
    pipeline_extensions_per_rfq,
    pipeline_winning_price_trend,
)
from rfq_aggregations import (
    aggregate_list_rfqs,
    aggregate_rfq_by_id,
    bid_stats_from_aggregated_rfq,
    strip_internal_fields,
)
from models import (
    RFQCreate, RFQUpdate, RFQResponse, BidCreate, BidResponse,
    ActivityLogResponse, AuctionStatus, ExtensionTriggerType, AwardRequest,
)
from ws_manager import ws_manager

router = APIRouter(prefix="/api", tags=["RFQ & Auction"])


# ─── Helpers ───

def serialize_rfq(
    doc: dict,
    lowest_bid=None,
    total_bids=0,
    winner_carrier=None,
    winning_bid_total=None,
    status_override: str | None = None,
) -> dict:
    st = status_override if status_override is not None else doc.get("status")
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
        technical_specs_url=doc.get("technical_specs_url", ""),
        technical_specs_file_name=doc.get("technical_specs_file_name", ""),
        technical_specs_content_type=doc.get("technical_specs_content_type", ""),
        technical_specs_file_size_bytes=doc.get("technical_specs_file_size_bytes", 0),
        loading_unloading_notes=doc.get("loading_unloading_notes", ""),
        supplier_visibility_mode=doc.get("supplier_visibility_mode", "full_rank"),
        awarded_supplier=doc.get("awarded_supplier"),
        awarded_bid_id=doc.get("awarded_bid_id"),
        awarded_at=doc.get("awarded_at"),
        award_note=doc.get("award_note"),
        status=st,
        lowest_bid=lowest_bid,
        total_bids=total_bids,
        winner_carrier=winner_carrier,
        winning_bid_total=winning_bid_total,
        server_time=datetime.now(timezone.utc),
        created_at=doc["created_at"],
    ).model_dump(mode="json")


def serialize_bid(doc: dict) -> dict:
    return BidResponse(
        id=str(doc["_id"]),
        rfq_id=str(doc["rfq_id"]),
        carrier_name=doc.get("carrier_display_name") or doc["carrier_name"],
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


def _error(detail: str, *, code: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"code": code, "message": detail})


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


async def recalculate_ranks(rfq_id: str, *, session=None):
    """Recalculate all bid ranks for an RFQ based on total_price (ascending).
    For ties, the earlier bid gets the better rank.
    """
    query = bids_collection.find({"rfq_id": rfq_id}, session=session) if session else bids_collection.find({"rfq_id": rfq_id})
    cursor = query.sort(
        [("total_price", 1), ("created_at", 1)]
    )
    rank = 1
    async for bid in cursor:
        if session:
            await bids_collection.update_one({"_id": bid["_id"]}, {"$set": {"rank": rank}}, session=session)
        else:
            await bids_collection.update_one({"_id": bid["_id"]}, {"$set": {"rank": rank}})
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


def _normalize_visibility_mode(value: str) -> str:
    if value not in {"full_rank", "masked_competitor"}:
        raise HTTPException(400, "Supplier visibility mode must be full_rank or masked_competitor")
    return value


async def check_and_extend_auction(rfq_id: str, rfq: dict, trigger_reason: str, *, trigger_type: str = "", bidder: str = ""):
    """Extend close time only in-window; one concurrent extension wins (atomic update on current_close)."""
    fresh_rfq = await rfqs_collection.find_one({"_id": rfq["_id"]})
    if not fresh_rfq:
        return False
    if not is_british_style_auction(fresh_rfq.get("auction_type")):
        return False

    now = datetime.now(timezone.utc)
    current_close = _ensure_tz(fresh_rfq["current_close_time"])
    forced_close = _ensure_tz(fresh_rfq["forced_close_time"])
    trigger_window = fresh_rfq["trigger_window_minutes"]
    extension_duration = fresh_rfq["extension_duration_minutes"]

    window_start = current_close - timedelta(minutes=trigger_window)

    if not (window_start <= now <= current_close):
        return False

    new_close = current_close + timedelta(minutes=extension_duration)
    if new_close > forced_close:
        new_close = forced_close
    if new_close <= current_close:
        return False

    res = await rfqs_collection.update_one(
        {"_id": rfq["_id"], "current_close_time": current_close},
        {"$set": {"current_close_time": new_close}},
    )
    if res.modified_count == 0:
        return False
    await log_activity(
        rfq_id,
        "time_extended",
        f"Auction extended by {extension_duration} min. New close: {new_close.strftime('%d %b %Y, %I:%M %p')} UTC. Reason: {trigger_reason}",
        {
            "old_close": current_close.isoformat(),
            "new_close": new_close.isoformat(),
            "reason": trigger_reason,
            "trigger_type": trigger_type,
            "bidder": bidder,
        },
    )
    await ws_manager.broadcast(
        rfq_id,
        {
            "type": "time_extended",
            "rfq_id": rfq_id,
            "old_close": current_close.isoformat(),
            "new_close": new_close.isoformat(),
            "extension_minutes": extension_duration,
        },
    )
    return True


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
    if rfq.minimum_decrement >= rfq.starting_price:
        raise HTTPException(400, "Minimum decrement must be lower than starting price")
    visibility_mode = _normalize_visibility_mode(rfq.supplier_visibility_mode)

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
        "technical_specs_url": rfq.technical_specs_url,
        "technical_specs_file_name": rfq.technical_specs_file_name,
        "technical_specs_content_type": rfq.technical_specs_content_type,
        "technical_specs_file_size_bytes": rfq.technical_specs_file_size_bytes,
        "loading_unloading_notes": rfq.loading_unloading_notes,
        "supplier_visibility_mode": visibility_mode,
        "awarded_supplier": None,
        "awarded_bid_id": None,
        "awarded_at": None,
        "award_note": None,
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
    """List all RFQs with current status, lowest bid, and total bids (aggregated, read-only; no status writes on GET)."""
    if status == AuctionStatus.CLOSED:
        query = {"status": {"$in": [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]}}
    elif status:
        query = {"status": status}
    else:
        query = {}
    total, rows = await aggregate_list_rfqs(rfqs_collection, query, page, page_size)
    rfqs = []
    for raw in rows:
        total_bids, lowest_bid, l1 = bid_stats_from_aggregated_rfq(raw)
        st = compute_status(raw)
        winner_carrier, winning_bid_total = (None, None)
        if st in (AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED) and l1 is not None:
            winner_carrier = l1.get("carrier_name")
            winning_bid_total = l1.get("total_price")
        base = strip_internal_fields(raw)
        rfqs.append(
            serialize_rfq(
                base,
                lowest_bid,
                total_bids,
                winner_carrier,
                winning_bid_total,
                status_override=st,
            )
        )
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
    """Get detailed RFQ information (read-only: status from live clock, no writes on GET)."""
    try:
        oid = ObjectId(rfq_id)
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    doc = await aggregate_rfq_by_id(rfqs_collection, oid)
    if not doc:
        raise HTTPException(404, "RFQ not found")
    total_bids, lowest_bid, l1 = bid_stats_from_aggregated_rfq(doc)
    st = compute_status(doc)
    winner_carrier, winning_bid_total = (None, None)
    if st in (AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED) and l1 is not None:
        winner_carrier, winning_bid_total = l1.get("carrier_name"), l1.get("total_price")
    base = strip_internal_fields(doc)
    await log_audit(
        action="rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
    )
    return serialize_rfq(
        base,
        lowest_bid,
        total_bids,
        winner_carrier,
        winning_bid_total,
        status_override=st,
    )


@router.get("/metrics/bids-per-rfq")
async def metrics_bids_per_rfq(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    skip = (page - 1) * page_size
    rows, total = await pipeline_bids_per_rfq_metrics(
        skip, page_size, name_search=search
    )
    for row in rows:
        row["status"] = str(row.get("status", "")) if row.get("status") is not None else ""
    await log_audit(
        action="metrics_bids_per_rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
        metadata={"page": page, "page_size": page_size, "search": search},
    )
    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": page * page_size < total,
    }


@router.get("/metrics/avg-bids")
async def metrics_avg_bids(
    period: str = Query("day", pattern="^(day|week|month)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    items = await pipeline_avg_bids(period)
    for row in items:
        if "avg_bids" in row and row["avg_bids"] is not None and not isinstance(row["avg_bids"], (int, float)):
            try:
                row["avg_bids"] = float(row["avg_bids"])
            except (TypeError, ValueError):
                row["avg_bids"] = 0.0
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
    raw = await pipeline_winning_price_trend(period)
    items = []
    for row in raw:
        items.append(
            {
                "period_bucket": row.get("period_bucket"),
                "avg_winning_price": float(row.get("avg_winning_price") or 0),
                "min_winning_price": float(row.get("min_winning_price") or 0),
                "max_winning_price": float(row.get("max_winning_price") or 0),
                "closed_rfq_count": int(row.get("closed_rfq_count") or 0),
            }
        )
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    skip = (page - 1) * page_size
    items, total = await pipeline_extensions_per_rfq(skip, page_size, name_search=search)
    await log_audit(
        action="metrics_extensions_per_rfq_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
        metadata={"page": page, "page_size": page_size, "search": search},
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": page * page_size < total,
    }


@router.get("/metrics/extension-impact")
async def metrics_extension_impact(
    period: str = Query("day", pattern="^(day|week|month)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    items, rows = await pipeline_extension_impact(period)
    await log_audit(
        action="metrics_extension_impact_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="metrics",
        metadata={"period": period},
    )
    return {"period": period, "items": items, "rfq_items": rows}


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


@router.post("/rfqs/{rfq_id}/clone", response_model=dict)
async def clone_rfq(
    rfq_id: str,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    try:
        src = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not src:
        raise HTTPException(404, "RFQ not found")
    new_ref = f"RFQ-{uuid.uuid4().hex[:8].upper()}"
    new_doc = {k: v for k, v in src.items() if k != "_id"}
    new_doc["reference_id"] = new_ref
    new_doc["name"] = f"{src.get('name', 'RFQ').strip()} (Copy)"
    new_doc["status"] = AuctionStatus.UPCOMING
    new_doc["is_paused"] = False
    new_doc["awarded_supplier"] = None
    new_doc["awarded_bid_id"] = None
    new_doc["awarded_at"] = None
    new_doc["award_note"] = None
    new_doc["current_close_time"] = new_doc.get("bid_close_time", src.get("bid_close_time"))
    new_doc["created_at"] = datetime.now(timezone.utc)
    ins = await rfqs_collection.insert_one(new_doc)
    inserted = await rfqs_collection.find_one({"_id": ins.inserted_id})
    if inserted:
        await _update_status_with_logging(inserted)
    nid = str(ins.inserted_id)
    await log_activity(
        nid,
        "rfq_created",
        f"RFQ '{new_doc.get('name')}' ({new_ref}) cloned from {src.get('reference_id')}.",
    )
    await log_audit(
        action="rfq_cloned",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=nid,
        metadata={"source_id": rfq_id},
    )
    fresh = await rfqs_collection.find_one({"_id": ins.inserted_id})
    st = compute_status(fresh) if fresh else AuctionStatus.UPCOMING
    return serialize_rfq(fresh, None, 0, None, None, status_override=st)


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
    if float(merged.get("minimum_decrement", 0) or 0) >= float(merged.get("starting_price", 0) or 0):
        raise HTTPException(400, "Minimum decrement must be lower than starting price")
    if "supplier_visibility_mode" in payload:
        payload["supplier_visibility_mode"] = _normalize_visibility_mode(payload["supplier_visibility_mode"])

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


@router.post("/rfqs/{rfq_id}/award", response_model=dict)
async def award_rfq(
    rfq_id: str,
    payload: AwardRequest,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not rfq:
        raise HTTPException(404, "RFQ not found")

    await _update_status_with_logging(rfq)
    if rfq.get("status") not in [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]:
        raise HTTPException(400, "Winner can only be awarded after auction is closed")
    if rfq.get("awarded_bid_id"):
        raise HTTPException(409, "Winner already awarded for this RFQ")

    bid_object_id = None
    try:
        bid_object_id = ObjectId(payload.bid_id)
    except Exception:
        bid_object_id = payload.bid_id
    bid = await bids_collection.find_one({"_id": bid_object_id, "rfq_id": rfq_id})
    if not bid:
        raise HTTPException(404, "Bid not found for this RFQ")

    awarded_at = datetime.now(timezone.utc)
    await rfqs_collection.update_one(
        {"_id": rfq["_id"], "awarded_bid_id": None},
        {
            "$set": {
                "awarded_supplier": bid.get("carrier_name"),
                "awarded_bid_id": payload.bid_id,
                "awarded_at": awarded_at,
                "award_note": payload.award_note,
            }
        },
    )
    updated = await rfqs_collection.find_one({"_id": rfq["_id"]})
    if not updated.get("awarded_bid_id"):
        raise HTTPException(409, "Winner already awarded by another request")

    await log_activity(
        rfq_id,
        "award_winner",
        f"Buyer awarded winner {bid.get('carrier_display_name') or bid.get('carrier_name')} at ₹{float(bid.get('total_price', 0)):,.2f}",
        {
            "awarded_supplier": bid.get("carrier_name"),
            "awarded_bid_id": payload.bid_id,
            "awarded_at": awarded_at.isoformat(),
            "award_note": payload.award_note,
        },
    )
    await log_audit(
        action="rfq_awarded",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"awarded_bid_id": payload.bid_id, "award_note": payload.award_note},
    )
    total_bids = await bids_collection.count_documents({"rfq_id": rfq_id})
    lowest_bid_doc = await bids_collection.find_one({"rfq_id": rfq_id}, sort=[("total_price", 1)])
    lowest_bid = lowest_bid_doc["total_price"] if lowest_bid_doc else None
    winner_carrier, winning_bid_total = await _compute_winner(rfq_id, updated["status"])
    return serialize_rfq(updated, lowest_bid, total_bids, winner_carrier, winning_bid_total)


# ─── Bid Routes ───

@router.post("/rfqs/{rfq_id}/bids")
async def submit_bid(
    rfq_id: str,
    bid: BidCreate,
    request: Request,
    user: UserPrincipal = Depends(require_roles([UserRole.SUPPLIER])),
):
    """Submit a bid for an RFQ. Handles auction extension logic.
    
    If the same carrier submits again, their previous bid is updated (revised).
    """
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        _error("Invalid RFQ ID", code="invalid_rfq_id")

    if not rfq:
        _error("RFQ not found", code="rfq_not_found", status_code=404)

    now = datetime.now(timezone.utc)
    forced_close = _ensure_tz(rfq["forced_close_time"])
    current_close = _ensure_tz(rfq["current_close_time"])
    if now >= forced_close:
        _error("Forced close time reached. Bidding is permanently closed.", code="forced_close_reached")
    if now >= current_close:
        _error("Current bid close time elapsed. Auction is closed for bidding.", code="bid_close_elapsed")

    rfq["status"] = compute_status(rfq)
    if rfq["status"] != AuctionStatus.ACTIVE:
        _error(f"Auction is not active (status: {rfq['status']}). Cannot submit bid.", code="auction_not_active")

    # Validate bid amounts
    if bid.freight_charges < 0 or bid.origin_charges < 0 or bid.destination_charges < 0:
        _error("Charge values cannot be negative", code="negative_charge")

    total_price = round(bid.freight_charges + bid.origin_charges + bid.destination_charges, 2)

    if total_price <= 0:
        _error("Total bid amount must be greater than zero", code="non_positive_total")

    canonical_carrier = user.username
    carrier_display_name = bid.carrier_name.strip() or canonical_carrier

    old_l1 = await bids_collection.find_one({"rfq_id": rfq_id}, sort=[("total_price", 1)])
    old_l1_carrier = old_l1["carrier_name"] if old_l1 else None
    starting_price = float(rfq.get("starting_price", 0) or 0)
    minimum_decrement = float(rfq.get("minimum_decrement", 0) or 0)

    if starting_price > 0 and old_l1 is None and total_price > starting_price:
        _error(
            f"Bid must be less than or equal to starting price ₹{starting_price:,.2f}",
            code="starting_price_exceeded",
        )
    if old_l1 is not None and minimum_decrement > 0:
        required_max = round(float(old_l1["total_price"]) - minimum_decrement, 2)
        if required_max <= 0:
            _error(
                "Minimum decrement is too high for the current lowest bid. Buyer must reduce minimum decrement.",
                code="minimum_decrement_blocks_bidding",
            )
        if total_price > required_max:
            _error(
                f"Bid must beat current lowest by at least ₹{minimum_decrement:,.2f}. Maximum allowed: ₹{required_max:,.2f}",
                code="minimum_decrement_not_met",
            )

    # Get old ranks for rank-change detection
    old_ranks = {}
    async for b in bids_collection.find({"rfq_id": rfq_id}).sort("total_price", 1):
        old_ranks[b["carrier_name"]] = b.get("rank", 0)

    bid_update_doc = {
        "freight_charges": bid.freight_charges,
        "origin_charges": bid.origin_charges,
        "destination_charges": bid.destination_charges,
        "total_price": total_price,
        "transit_time": bid.transit_time,
        "validity": bid.validity,
        "vehicle_type": bid.vehicle_type,
        "capacity_tons": bid.capacity_tons,
        "insurance_included": bid.insurance_included,
        "carrier_display_name": carrier_display_name,
        "created_at": datetime.now(timezone.utc),
    }

    async def _persist_bid(session=None):
        existing = await bids_collection.find_one(
            {"rfq_id": rfq_id, "carrier_name": canonical_carrier},
            session=session,
        ) if session else await bids_collection.find_one({"rfq_id": rfq_id, "carrier_name": canonical_carrier})
        if existing:
            if session:
                await bids_collection.update_one({"_id": existing["_id"]}, {"$set": bid_update_doc}, session=session)
            else:
                await bids_collection.update_one({"_id": existing["_id"]}, {"$set": bid_update_doc})
            return existing["_id"], True, existing["total_price"]
        bid_doc = {
            "rfq_id": rfq_id,
            "carrier_name": canonical_carrier,
            **bid_update_doc,
            "rank": 0,
        }
        result = await bids_collection.insert_one(bid_doc, session=session) if session else await bids_collection.insert_one(bid_doc)
        return result.inserted_id, False, None

    bid_id = None
    is_revision = False
    old_total = None
    max_attempts = 3
    for _ in range(max_attempts):
        try:
            tx_session = None
            try:
                tx_session = await rfqs_collection.database.client.start_session()
                async with tx_session.start_transaction():
                    bid_id, is_revision, old_total = await _persist_bid(session=tx_session)
                    await recalculate_ranks(rfq_id, session=tx_session)
            except (OperationFailure, NotImplementedError, AttributeError, TypeError):
                bid_id, is_revision, old_total = await _persist_bid()
                await recalculate_ranks(rfq_id)
            finally:
                if tx_session is not None:
                    await tx_session.end_session()
            break
        except DuplicateKeyError:
            # Another request inserted same supplier bid concurrently; retry as update path.
            continue
    if bid_id is None:
        _error("Unable to submit bid due to concurrent updates. Please retry.", code="bid_concurrency_conflict", status_code=409)

    # Log bid submission
    if is_revision:
        await log_activity(
            rfq_id,
            "bid_submitted",
            f"{carrier_display_name} revised bid: ₹{total_price:,.2f} (was ₹{old_total:,.2f}). Freight: ₹{bid.freight_charges:,.2f}, Origin: ₹{bid.origin_charges:,.2f}, Dest: ₹{bid.destination_charges:,.2f}, Vehicle: {bid.vehicle_type or 'N/A'}, Capacity: {bid.capacity_tons:g} tons, Insurance: {'Yes' if bid.insurance_included else 'No'}",
            {"carrier": carrier_display_name, "supplier_username": canonical_carrier, "total_price": total_price, "old_total": old_total, "is_revision": True}
        )
    else:
        await log_activity(
            rfq_id,
            "bid_submitted",
            f"{carrier_display_name} submitted bid: ₹{total_price:,.2f} (Freight: ₹{bid.freight_charges:,.2f}, Origin: ₹{bid.origin_charges:,.2f}, Dest: ₹{bid.destination_charges:,.2f}, Vehicle: {bid.vehicle_type or 'N/A'}, Capacity: {bid.capacity_tons:g} tons, Insurance: {'Yes' if bid.insurance_included else 'No'})",
            {"carrier": carrier_display_name, "supplier_username": canonical_carrier, "total_price": total_price}
        )

    # Immutable bid revision for buyer timeline
    await bid_revisions_collection.insert_one(
        {
            "rfq_id": rfq_id,
            "bid_id": str(bid_id),
            "carrier_name": canonical_carrier,
            "total_price": total_price,
            "is_revision": is_revision,
            "previous_total": old_total,
            "created_at": datetime.now(timezone.utc),
        }
    )

    # Extension triggers (British-style auctions only; sealed/fixed opt-out on auction_type)
    trigger = rfq["extension_trigger"]
    if is_british_style_auction(rfq.get("auction_type")):
        if trigger == ExtensionTriggerType.BID_RECEIVED:
            await check_and_extend_auction(
                rfq_id,
                rfq,
                f"Bid received from {carrier_display_name}",
                trigger_type="bid_received",
                bidder=canonical_carrier,
            )
        elif trigger == ExtensionTriggerType.RANK_CHANGE:
            new_ranks = {}
            async for b in bids_collection.find({"rfq_id": rfq_id}).sort("total_price", 1):
                new_ranks[b["carrier_name"]] = b["rank"]
            if new_ranks != old_ranks:
                await check_and_extend_auction(
                    rfq_id,
                    rfq,
                    f"Supplier rank changed after bid from {carrier_display_name}",
                    trigger_type="rank_change",
                    bidder=canonical_carrier,
                )
        elif trigger == ExtensionTriggerType.L1_CHANGE:
            new_l1 = await bids_collection.find_one(
                {"rfq_id": rfq_id}, sort=[("total_price", 1)]
            )
            new_l1_carrier = new_l1["carrier_name"] if new_l1 else None
            if new_l1_carrier != old_l1_carrier:
                await check_and_extend_auction(
                    rfq_id,
                    rfq,
                    f"L1 changed: {old_l1_carrier} → {new_l1_carrier}",
                    trigger_type="l1_change",
                    bidder=canonical_carrier,
                )

    # Reload bid with updated rank
    bid_doc = await bids_collection.find_one({"_id": bid_id})
    await ws_manager.broadcast(
        rfq_id,
        {
            "type": "bid_updated",
            "rfq_id": rfq_id,
            "carrier_name": carrier_display_name,
            "supplier_username": canonical_carrier,
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
        metadata={"rfq_id": rfq_id, "carrier_name": carrier_display_name, "supplier_username": canonical_carrier},
        request_id=request.headers.get("x-request-id", ""),
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
        row = serialize_bid(doc)
        visibility_mode = rfq.get("supplier_visibility_mode", "full_rank")
        if user.role == UserRole.SUPPLIER and visibility_mode == "masked_competitor":
            is_self = doc.get("carrier_name") == user.username
            if not is_self:
                row["carrier_name"] = "Competitor"
                row["freight_charges"] = 0
                row["origin_charges"] = 0
                row["destination_charges"] = 0
                row["total_price"] = 0
                row["transit_time"] = 0
                row["validity"] = "Hidden"
                row["vehicle_type"] = ""
                row["capacity_tons"] = 0
                row["insurance_included"] = False
        bids.append(row)
    await log_audit(
        action="bids_viewed",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"page": page, "page_size": page_size},
    )
    return _pagination_meta(bids, total, page, page_size)


@router.get("/rfqs/{rfq_id}/bids/export")
async def export_bids(
    rfq_id: str,
    format: str = Query("csv", pattern="^(csv)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER])),
):
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not rfq:
        raise HTTPException(404, "RFQ not found")

    rows: list[dict] = []
    async for doc in bids_collection.find({"rfq_id": rfq_id}).sort(
        [("total_price", 1), ("created_at", 1)]
    ):
        rows.append(doc)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "rank",
            "supplier_username",
            "display_name",
            "total_price",
            "freight",
            "origin",
            "destination",
            "transit_time_days",
            "validity",
            "created_at_utc",
        ]
    )
    for doc in rows:
        writer.writerow(
            [
                doc.get("rank", ""),
                doc.get("carrier_name", ""),
                (doc.get("carrier_display_name") or "").strip() or doc.get("carrier_name", ""),
                doc.get("total_price", ""),
                doc.get("freight_charges", ""),
                doc.get("origin_charges", ""),
                doc.get("destination_charges", ""),
                doc.get("transit_time", ""),
                doc.get("validity", ""),
                _ensure_tz(doc.get("created_at")).isoformat() if doc.get("created_at") else "",
            ]
        )
    await log_audit(
        action="bids_exported",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"format": format},
    )
    name = f"rfq-{rfq_id}-bids.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/rfqs/{rfq_id}/bid-revisions")
async def list_bid_revisions(
    rfq_id: str,
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    try:
        oid = ObjectId(rfq_id)
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    doc = await rfqs_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "RFQ not found")

    q: dict = {"rfq_id": rfq_id}
    if user.role == UserRole.SUPPLIER:
        q["carrier_name"] = user.username
    items: list[dict] = []
    async for r in bid_revisions_collection.find(q).sort("created_at", 1):
        items.append(
            {
                "id": str(r["_id"]),
                "rfq_id": r.get("rfq_id"),
                "bid_id": r.get("bid_id"),
                "carrier_name": r.get("carrier_name"),
                "total_price": r.get("total_price"),
                "is_revision": r.get("is_revision", False),
                "previous_total": r.get("previous_total"),
                "created_at": r.get("created_at"),
            }
        )
    return {"items": items}


@router.get("/supplier/my-auctions")
async def my_supplier_auctions(
    user: UserPrincipal = Depends(require_roles([UserRole.SUPPLIER])),
):
    uname = user.username
    rows = await bids_collection.aggregate(
        [
            {"$match": {"carrier_name": uname}},
            {
                "$lookup": {
                    "from": "rfqs",
                    "let": {"rid": "$rfq_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$eq": [{"$toString": "$_id"}, "$$rid"]
                                }
                            }
                        }
                    ],
                    "as": "r",
                }
            },
            {"$unwind": {"path": "$r", "preserveNullAndEmptyArrays": True}},
            {
                "$lookup": {
                    "from": "bids",
                    "let": {"rid": "$rfq_id"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$rfq_id", "$$rid"]}}},
                        {"$sort": {"total_price": 1, "created_at": 1}},
                        {"$limit": 1},
                    ],
                    "as": "l1",
                }
            },
        ]
    ).to_list(length=5000)
    out: list[dict] = []
    for row in rows:
        rdoc = row.get("r")
        if not rdoc:
            continue
        rid = row.get("rfq_id")
        st = compute_status(rdoc)
        l1p = (row.get("l1") or [{}])[0].get("total_price")
        out.append(
            {
                "rfq_id": rid,
                "name": rdoc.get("name"),
                "reference_id": rdoc.get("reference_id"),
                "status": st.value if hasattr(st, "value") else str(st),
                "bid_start_time": rdoc.get("bid_start_time"),
                "current_close_time": rdoc.get("current_close_time"),
                "my_total_price": row.get("total_price"),
                "my_rank": row.get("rank"),
                "l1_price": l1p,
            }
        )
    out.sort(
        key=lambda x: (str(x.get("status", "")), x.get("current_close_time") or ""),
        reverse=True,
    )
    return {"items": out}


# ─── Activity Log Routes ───

@router.get("/rfqs/{rfq_id}/activity")
async def get_activity(
    rfq_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    event_type: str | None = None,
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
    query: dict = {"rfq_id": rfq_id}
    if event_type and event_type.strip():
        query["event_type"] = event_type.strip()
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
        metadata={"page": page, "page_size": page_size, "event_type": event_type},
    )
    return _pagination_meta(logs, total, page, page_size)


@router.get("/rfqs/{rfq_id}/activity/export")
async def export_activity(
    rfq_id: str,
    format: str = Query("csv", pattern="^(csv)$"),
    user: UserPrincipal = Depends(require_roles([UserRole.BUYER, UserRole.SUPPLIER])),
):
    try:
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    except Exception:
        raise HTTPException(400, "Invalid RFQ ID")
    if not rfq:
        raise HTTPException(404, "RFQ not found")

    logs = []
    async for doc in activity_logs_collection.find({"rfq_id": rfq_id}).sort("created_at", 1):
        logs.append(doc)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp_utc", "event_type", "description", "metadata"])
    for log in logs:
        writer.writerow(
            [
                _ensure_tz(log.get("created_at")).isoformat() if log.get("created_at") else "",
                log.get("event_type", ""),
                log.get("description", ""),
                str(log.get("metadata", {})),
            ]
        )
    await log_audit(
        action="activity_exported",
        username=user.username,
        role=user.role.value,
        resource_type="rfq",
        resource_id=rfq_id,
        metadata={"format": format},
    )
    filename = f"rfq-{rfq_id}-activity.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.websocket("/ws/rfqs/{rfq_id}")
async def rfq_socket(websocket: WebSocket, rfq_id: str):
    subprotocols = websocket.scope.get("subprotocols", [])
    token = subprotocols[1] if len(subprotocols) >= 2 and subprotocols[0] == "token" else None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return
    try:
        principal = user_from_token(token)
        user_doc = await users_collection.find_one({"username": principal.username})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User no longer exists")
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid auth token")
        return
    await ws_manager.connect(rfq_id, websocket, subprotocol="token")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(rfq_id, websocket)
