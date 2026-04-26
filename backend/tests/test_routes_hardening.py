from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

sys.path.append(str(Path(__file__).resolve().parents[1]))

import auth
import routes
from models import AuctionStatus


async def _noop_async(*_args, **_kwargs):
    return None


def _req():
    return SimpleNamespace(headers={})


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, key, direction=1):
        reverse = direction == -1
        if isinstance(key, list):
            for field, dir_value in reversed(key):
                self.docs.sort(key=lambda d: d.get(field), reverse=(dir_value == -1))
            return self
        self.docs.sort(key=lambda d: d.get(key), reverse=reverse)
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    async def __aiter__(self):
        for doc in self.docs:
            yield doc


class FakeRFQsCollection:
    def __init__(self, docs):
        self.docs = docs
        self.last_query = None

    async def find_one(self, query):
        if "_id" in query:
            return self.docs.get(query["_id"])
        return None

    async def update_one(self, query, update):
        doc = self.docs.get(query.get("_id"))
        if doc:
            doc.update(update.get("$set", {}))

    async def count_documents(self, query):
        self.last_query = query
        return len(self._filter(query))

    def find(self, query):
        self.last_query = query
        return FakeCursor(self._filter(query))

    def _filter(self, query):
        if not query:
            return list(self.docs.values())
        status_filter = query.get("status")
        if isinstance(status_filter, dict) and "$in" in status_filter:
            allowed = set(status_filter["$in"])
            return [d for d in self.docs.values() if d.get("status") in allowed]
        if isinstance(status_filter, str):
            return [d for d in self.docs.values() if d.get("status") == status_filter]
        return list(self.docs.values())


class FakeBidsCollection:
    def __init__(self, docs):
        self.docs = docs
        self.seq = 0

    async def find_one(self, query, sort=None):
        bids = [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]
        if sort:
            for field, direction in reversed(sort):
                bids.sort(key=lambda d: d[field], reverse=(direction == -1))
        return bids[0] if bids else None

    async def count_documents(self, query):
        return len([d for d in self.docs if all(d.get(k) == v for k, v in query.items())])

    async def update_one(self, query, update):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(update.get("$set", {}))
                return

    async def insert_one(self, doc):
        if "_id" not in doc:
            self.seq += 1
            doc["_id"] = f"bid-{self.seq}"
        self.docs.append(doc)

        class InsertResult:
            inserted_id = doc["_id"]

        return InsertResult()

    def find(self, query):
        return FakeCursor([d for d in self.docs if all(d.get(k) == v for k, v in query.items())])


def make_rfq(now, extension_trigger="bid_received", close_delta_minutes=5, forced_delta_minutes=20):
    return {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "name": "RFQ Hardening",
        "reference_id": "RFQ-HARDEN1",
        "bid_start_time": now - timedelta(hours=1),
        "bid_close_time": now + timedelta(minutes=close_delta_minutes),
        "current_close_time": now + timedelta(minutes=close_delta_minutes),
        "forced_close_time": now + timedelta(minutes=forced_delta_minutes),
        "pickup_date": now + timedelta(days=1),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
        "extension_trigger": extension_trigger,
        "status": AuctionStatus.ACTIVE,
        "is_paused": False,
        "created_at": now - timedelta(minutes=30),
    }


def make_bid(carrier_name, total, rank=1):
    return {
        "_id": f"{carrier_name}-{total}",
        "rfq_id": str(ObjectId("507f1f77bcf86cd799439011")),
        "carrier_name": carrier_name,
        "freight_charges": total,
        "origin_charges": 0.0,
        "destination_charges": 0.0,
        "total_price": float(total),
        "transit_time": 2,
        "validity": "7 days",
        "vehicle_type": "",
        "capacity_tons": 0,
        "insurance_included": False,
        "rank": rank,
        "created_at": datetime.now(timezone.utc),
    }


@pytest.mark.asyncio
async def test_list_rfqs_closed_status_includes_force_closed(monkeypatch):
    now = datetime.now(timezone.utc)
    closed_id = ObjectId("507f1f77bcf86cd799439012")
    force_closed_id = ObjectId("507f1f77bcf86cd799439013")
    rfqs_collection = FakeRFQsCollection({
        closed_id: {**make_rfq(now), "_id": closed_id, "status": AuctionStatus.CLOSED},
        force_closed_id: {**make_rfq(now), "_id": force_closed_id, "status": AuctionStatus.FORCE_CLOSED},
    })
    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", FakeBidsCollection([]))
    monkeypatch.setattr(routes, "log_audit", _noop_async)

    async def fake_update_status(doc):
        return doc["status"]

    monkeypatch.setattr(routes, "_update_status_with_logging", fake_update_status)

    user = auth.UserPrincipal(username="buyer", role=auth.UserRole.BUYER)
    result = await routes.list_rfqs(page=1, page_size=20, status="closed", user=user)

    assert result["total"] == 2
    assert {item["status"] for item in result["items"]} == {AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED}
    assert rfqs_collection.last_query == {"status": {"$in": [AuctionStatus.CLOSED, AuctionStatus.FORCE_CLOSED]}}


@pytest.mark.asyncio
async def test_submit_bid_trigger_bid_received_calls_extension(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="bid_received")
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    bids_collection = FakeBidsCollection([])
    extension_calls = []

    async def extension_spy(*args, **kwargs):
        extension_calls.append((args, kwargs))
        return True

    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "check_and_extend_auction", extension_spy)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=1000,
        origin_charges=50,
        destination_charges=50,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    await routes.submit_bid(rfq_id, bid, _req(), user)
    assert len(extension_calls) == 1


@pytest.mark.asyncio
async def test_submit_bid_trigger_rank_change_calls_extension_only_on_rank_change(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="rank_change")
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    existing = [make_bid("Carrier A", 1000, rank=1), make_bid("Carrier B", 1200, rank=2)]
    bids_collection = FakeBidsCollection(existing)
    extension_calls = []

    async def extension_spy(*args, **kwargs):
        extension_calls.append((args, kwargs))
        return True

    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "check_and_extend_auction", extension_spy)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    # Carrier B improves to become L1: ranks change -> extension expected.
    bid = routes.BidCreate(
        carrier_name="Carrier B",
        freight_charges=900,
        origin_charges=0,
        destination_charges=0,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    await routes.submit_bid(rfq_id, bid, _req(), user)
    assert len(extension_calls) == 1


@pytest.mark.asyncio
async def test_submit_bid_trigger_l1_change_calls_extension_only_on_l1_change(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="l1_change")
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    existing = [make_bid("Carrier A", 1000, rank=1), make_bid("Carrier B", 1200, rank=2)]
    bids_collection = FakeBidsCollection(existing)
    extension_calls = []

    async def extension_spy(*args, **kwargs):
        extension_calls.append((args, kwargs))
        return True

    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "check_and_extend_auction", extension_spy)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    # Carrier B improves but does not beat L1: no extension expected.
    non_l1_bid = routes.BidCreate(
        carrier_name="Carrier B",
        freight_charges=1100,
        origin_charges=0,
        destination_charges=0,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    await routes.submit_bid(rfq_id, non_l1_bid, _req(), user)
    assert len(extension_calls) == 0

    # Carrier B now beats L1: extension expected.
    l1_bid = routes.BidCreate(
        carrier_name="Carrier B",
        freight_charges=900,
        origin_charges=0,
        destination_charges=0,
        transit_time=2,
        validity="7 days",
    )
    await routes.submit_bid(rfq_id, l1_bid, _req(), user)
    assert len(extension_calls) == 1


@pytest.mark.asyncio
async def test_submit_bid_no_extension_outside_trigger_window(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="bid_received", close_delta_minutes=45)
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    bids_collection = FakeBidsCollection([])
    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=1000,
        origin_charges=50,
        destination_charges=50,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    old_close = rfq["current_close_time"]
    await routes.submit_bid(rfq_id, bid, _req(), user)
    assert rfq["current_close_time"] == old_close


@pytest.mark.asyncio
async def test_submit_bid_rejected_after_forced_close_and_status_transitions(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="bid_received")
    rfq["forced_close_time"] = now - timedelta(minutes=1)
    rfq["current_close_time"] = now + timedelta(minutes=2)
    rfq["status"] = AuctionStatus.ACTIVE
    rfq_id = str(rfq["_id"])

    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    bids_collection = FakeBidsCollection([])
    logged_events = []

    async def fake_log_activity(rfq_id_value, event_type, description, metadata=None):
        logged_events.append((rfq_id_value, event_type, description, metadata))

    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "log_activity", fake_log_activity)

    # Route-level rejection path
    bid = routes.BidCreate(
        carrier_name="Carrier A",
        freight_charges=1000,
        origin_charges=50,
        destination_charges=50,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    with pytest.raises(HTTPException) as exc:
        await routes.submit_bid(rfq_id, bid, _req(), user)
    assert exc.value.status_code == 400
    detail = exc.value.detail
    message = detail.get("message", "") if isinstance(detail, dict) else str(detail)
    assert "Forced close time reached" in message

    # Explicit status transition assertion
    rfq["status"] = AuctionStatus.ACTIVE
    status = await routes._update_status_with_logging(rfq)
    assert status == AuctionStatus.FORCE_CLOSED
    assert rfq["status"] == AuctionStatus.FORCE_CLOSED
    assert any(event[1] == "auction_closed" for event in logged_events)


@pytest.mark.asyncio
async def test_submit_bid_binds_identity_to_authenticated_supplier(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="bid_received")
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})
    bids_collection = FakeBidsCollection([])

    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    bid = routes.BidCreate(
        carrier_name="Spoofed Carrier",
        freight_charges=900,
        origin_charges=20,
        destination_charges=10,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="real_supplier_user", role=auth.UserRole.SUPPLIER)
    res = await routes.submit_bid(rfq_id, bid, _req(), user)

    assert bids_collection.docs[0]["carrier_name"] == "real_supplier_user"
    assert bids_collection.docs[0]["carrier_display_name"] == "Spoofed Carrier"
    assert res["carrier_name"] == "Spoofed Carrier"


@pytest.mark.asyncio
async def test_submit_bid_duplicate_key_race_recovers_with_retry(monkeypatch):
    now = datetime.now(timezone.utc)
    rfq = make_rfq(now, extension_trigger="bid_received")
    rfq_id = str(rfq["_id"])
    rfqs_collection = FakeRFQsCollection({rfq["_id"]: rfq})

    class RaceBidsCollection(FakeBidsCollection):
        def __init__(self):
            super().__init__([])
            self.raise_duplicate_once = True

        async def find_one(self, query, sort=None):
            if query.get("rfq_id") == rfq_id and query.get("carrier_name") == "supplier" and self.raise_duplicate_once:
                return None
            return await super().find_one(query, sort=sort)

        async def insert_one(self, doc):
            if self.raise_duplicate_once:
                self.raise_duplicate_once = False
                # simulate competing request inserted winner doc first
                self.docs.append(
                    {
                        "_id": "race-existing",
                        "rfq_id": doc["rfq_id"],
                        "carrier_name": doc["carrier_name"],
                        "carrier_display_name": doc.get("carrier_display_name", ""),
                        "freight_charges": 800.0,
                        "origin_charges": 0.0,
                        "destination_charges": 0.0,
                        "total_price": 800.0,
                        "transit_time": 2,
                        "validity": "7 days",
                        "vehicle_type": "",
                        "capacity_tons": 0,
                        "insurance_included": False,
                        "rank": 1,
                        "created_at": datetime.now(timezone.utc),
                    }
                )
                raise DuplicateKeyError("duplicate key error")
            return await super().insert_one(doc)

    bids_collection = RaceBidsCollection()
    monkeypatch.setattr(routes, "rfqs_collection", rfqs_collection)
    monkeypatch.setattr(routes, "bids_collection", bids_collection)
    monkeypatch.setattr(routes, "log_activity", _noop_async)
    monkeypatch.setattr(routes, "log_audit", _noop_async)
    monkeypatch.setattr(routes.ws_manager, "broadcast", _noop_async)

    bid = routes.BidCreate(
        carrier_name="Carrier Label",
        freight_charges=700,
        origin_charges=50,
        destination_charges=50,
        transit_time=2,
        validity="7 days",
    )
    user = auth.UserPrincipal(username="supplier", role=auth.UserRole.SUPPLIER)
    res = await routes.submit_bid(rfq_id, bid, _req(), user)
    assert bids_collection.raise_duplicate_once is False
    supplier_rows = [row for row in bids_collection.docs if row.get("carrier_name") == "supplier"]
    assert len(supplier_rows) == 1
    assert res["carrier_name"] == "Carrier Label"
    assert res["total_price"] == 800.0
