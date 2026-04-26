from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import pytest
from bson import ObjectId
from fastapi import HTTPException

sys.path.append(str(Path(__file__).resolve().parents[1]))

import auth
import routes
from models import AuctionStatus


class FakeResult:
    def __init__(self, inserted_id=None):
        self.inserted_id = inserted_id


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or {}
        self._seq = 1

    async def find_one(self, query):
        _id = query.get("_id")
        if _id is not None:
            return self.docs.get(_id)
        return None

    async def update_one(self, query, update):
        _id = query.get("_id")
        if _id in self.docs:
            for key, value in update.get("$set", {}).items():
                self.docs[_id][key] = value
        return FakeResult()

    async def insert_one(self, doc):
        key = doc.get("_id")
        if key is None:
            key = f"id-{self._seq}"
            self._seq += 1
        self.docs[key] = doc
        return FakeResult(inserted_id=key)

    def find(self, query):
        rfq_id = query.get("rfq_id")
        matched = [doc for doc in self.docs.values() if doc.get("rfq_id") == rfq_id]
        return FakeCursor(matched)


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    async def __aiter__(self):
        for doc in self.docs:
            yield doc


class FrozenDateTime:
    now_value = datetime.now(timezone.utc)

    @classmethod
    def now(cls, tz=None):
        if tz is not None:
            return cls.now_value.astimezone(tz)
        return cls.now_value


def make_active_rfq(now):
    return {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "name": "Test RFQ",
        "reference_id": "RFQ-TEST1234",
        "bid_start_time": now - timedelta(hours=1),
        "bid_close_time": now + timedelta(minutes=5),
        "current_close_time": now + timedelta(minutes=5),
        "forced_close_time": now + timedelta(minutes=15),
        "pickup_date": now + timedelta(days=1),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
        "extension_trigger": "bid_received",
        "status": AuctionStatus.ACTIVE,
        "created_at": now,
    }


@pytest.mark.asyncio
async def test_compute_status_force_closed():
    now = datetime.now(timezone.utc)
    doc = {
        "bid_start_time": now - timedelta(hours=2),
        "current_close_time": now - timedelta(minutes=10),
        "forced_close_time": now - timedelta(minutes=1),
    }
    assert routes.compute_status(doc) == AuctionStatus.FORCE_CLOSED


@pytest.mark.asyncio
async def test_check_and_extend_never_exceeds_forced(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq_id = "rfq-1"
    object_id = "doc-1"
    doc = {
        "_id": object_id,
        "current_close_time": now + timedelta(minutes=2),
        "forced_close_time": now + timedelta(minutes=4),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
    }
    fake_collection = FakeCollection({object_id: doc})
    logs = []

    async def fake_log_activity(*args, **kwargs):
        logs.append((args, kwargs))

    monkeypatch.setattr(routes, "rfqs_collection", fake_collection)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)

    extended = await routes.check_and_extend_auction(
        rfq_id, doc, "Bid received from Carrier A"
    )

    assert extended is True
    assert fake_collection.docs[object_id]["current_close_time"] <= doc["forced_close_time"]
    assert len(logs) == 1


@pytest.mark.asyncio
async def test_check_and_extend_at_window_start_extends(monkeypatch):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    object_id = "doc-window-start"
    current_close = now + timedelta(minutes=10)
    doc = {
        "_id": object_id,
        "current_close_time": current_close,
        "forced_close_time": now + timedelta(hours=1),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
    }
    fake_collection = FakeCollection({object_id: doc})
    logs = []

    async def fake_log_activity(*args, **kwargs):
        logs.append((args, kwargs))

    monkeypatch.setattr(routes, "rfqs_collection", fake_collection)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)
    monkeypatch.setattr(routes, "datetime", FrozenDateTime)
    FrozenDateTime.now_value = now

    extended = await routes.check_and_extend_auction("rfq-1", doc, "window-start")
    assert extended is True
    assert fake_collection.docs[object_id]["current_close_time"] == current_close + timedelta(minutes=5)
    assert len(logs) == 1


@pytest.mark.asyncio
async def test_check_and_extend_at_forced_close_does_not_extend(monkeypatch):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    object_id = "doc-forced-close"
    doc = {
        "_id": object_id,
        "current_close_time": now,
        "forced_close_time": now,
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
    }
    fake_collection = FakeCollection({object_id: doc})

    async def fake_log_activity(*args, **kwargs):
        return None

    monkeypatch.setattr(routes, "rfqs_collection", fake_collection)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)
    monkeypatch.setattr(routes, "datetime", FrozenDateTime)
    FrozenDateTime.now_value = now

    extended = await routes.check_and_extend_auction("rfq-1", doc, "forced-close")
    assert extended is False
    assert fake_collection.docs[object_id]["current_close_time"] == now


@pytest.mark.asyncio
async def test_check_and_extend_multiple_consecutive_extensions(monkeypatch):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    object_id = "doc-consecutive"
    doc = {
        "_id": object_id,
        "current_close_time": now + timedelta(minutes=2),
        "forced_close_time": now + timedelta(minutes=10),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 3,
    }
    fake_collection = FakeCollection({object_id: doc})
    logs = []

    async def fake_log_activity(*args, **kwargs):
        logs.append((args, kwargs))

    monkeypatch.setattr(routes, "rfqs_collection", fake_collection)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)
    monkeypatch.setattr(routes, "datetime", FrozenDateTime)

    FrozenDateTime.now_value = now
    first = await routes.check_and_extend_auction("rfq-1", doc, "first")
    assert first is True
    assert fake_collection.docs[object_id]["current_close_time"] == now + timedelta(minutes=5)

    FrozenDateTime.now_value = now + timedelta(minutes=4)
    second = await routes.check_and_extend_auction("rfq-1", doc, "second")
    assert second is True
    assert fake_collection.docs[object_id]["current_close_time"] == now + timedelta(minutes=8)

    FrozenDateTime.now_value = now + timedelta(minutes=7)
    third = await routes.check_and_extend_auction("rfq-1", doc, "third")
    assert third is True
    assert fake_collection.docs[object_id]["current_close_time"] == now + timedelta(minutes=10)
    assert len(logs) == 3


@pytest.mark.asyncio
async def test_submit_bid_rejects_when_auction_not_active(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_active_rfq(now)
    rfq["current_close_time"] = now - timedelta(minutes=1)
    rfq_id = str(rfq["_id"])
    rfqs = FakeCollection({rfq["_id"]: rfq})

    monkeypatch.setattr(routes, "rfqs_collection", rfqs)

    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=100.0,
        origin_charges=10.0,
        destination_charges=5.0,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier1", role=auth.UserRole.SUPPLIER)

    with pytest.raises(HTTPException) as exc:
        await routes.submit_bid(rfq_id, bid, user)
    assert exc.value.status_code == 400
    assert "Auction is not active" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_submit_bid_rejects_negative_components(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_active_rfq(now)
    rfq_id = str(rfq["_id"])
    rfqs = FakeCollection({rfq["_id"]: rfq})

    monkeypatch.setattr(routes, "rfqs_collection", rfqs)

    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=100.0,
        origin_charges=10.0,
        destination_charges=0.0,
        transit_time=2,
        validity="7 days",
    )
    # Force invalid value after model validation to test route guard.
    bid.origin_charges = -1
    user = auth.UserPrincipal(username="supplier1", role=auth.UserRole.SUPPLIER)

    with pytest.raises(HTTPException) as exc:
        await routes.submit_bid(rfq_id, bid, user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Charge values cannot be negative"


@pytest.mark.asyncio
async def test_submit_bid_rejects_non_positive_total(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_active_rfq(now)
    rfq_id = str(rfq["_id"])
    rfqs = FakeCollection({rfq["_id"]: rfq})

    monkeypatch.setattr(routes, "rfqs_collection", rfqs)

    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=0.0,
        origin_charges=0.0,
        destination_charges=0.0,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier1", role=auth.UserRole.SUPPLIER)

    with pytest.raises(HTTPException) as exc:
        await routes.submit_bid(rfq_id, bid, user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Total bid amount must be greater than zero"


@pytest.mark.asyncio
async def test_create_rfq_rejects_forced_close_not_greater(monkeypatch):
    now = datetime.now(timezone.utc)
    rfqs = FakeCollection()

    async def fake_log_activity(*args, **kwargs):
        return None

    async def fake_log_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(routes, "rfqs_collection", rfqs)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)
    monkeypatch.setattr(routes, "log_audit", fake_log_audit)

    payload = routes.RFQCreate(
        name="Invalid Forced Close",
        bid_start_time=now + timedelta(minutes=5),
        bid_close_time=now + timedelta(minutes=30),
        forced_close_time=now + timedelta(minutes=30),
        pickup_date=now + timedelta(days=1),
        trigger_window_minutes=10,
        extension_duration_minutes=5,
        extension_trigger="bid_received",
    )
    user = auth.UserPrincipal(username="buyer1", role=auth.UserRole.BUYER)

    with pytest.raises(HTTPException) as exc:
        await routes.create_rfq(payload, user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Forced close time must be later than bid close time"
