import asyncio
from datetime import datetime, timedelta, timezone

from auth import UserRole, hash_password
from database import activity_logs_collection, bids_collection, rfqs_collection, users_collection


async def seed_demo():
    now = datetime.now(timezone.utc)
    rfq_name = "Demo RFQ - Bangalore to Pune"

    await users_collection.delete_many({"username": {"$in": ["demo_buyer", "demo_supplier_a", "demo_supplier_b"]}})
    await rfqs_collection.delete_many({"name": rfq_name})

    await users_collection.insert_many(
        [
            {
                "username": "demo_buyer",
                "email": "demo_buyer@example.com",
                "password_hash": hash_password("demo123"),
                "role": UserRole.BUYER.value,
                "created_at": now,
            },
            {
                "username": "demo_supplier_a",
                "email": "demo_supplier_a@example.com",
                "password_hash": hash_password("demo123"),
                "role": UserRole.SUPPLIER.value,
                "created_at": now,
            },
            {
                "username": "demo_supplier_b",
                "email": "demo_supplier_b@example.com",
                "password_hash": hash_password("demo123"),
                "role": UserRole.SUPPLIER.value,
                "created_at": now,
            },
        ]
    )

    rfq_doc = {
        "name": rfq_name,
        "reference_id": "RFQ-DEMO2026",
        "bid_start_time": now - timedelta(minutes=20),
        "bid_close_time": now + timedelta(minutes=10),
        "current_close_time": now + timedelta(minutes=10),
        "forced_close_time": now + timedelta(minutes=30),
        "pickup_date": now + timedelta(days=2),
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
        "extension_trigger": "bid_received",
        "status": "active",
        "created_at": now,
    }
    rfq_result = await rfqs_collection.insert_one(rfq_doc)
    rfq_id = str(rfq_result.inserted_id)

    bid_docs = [
        {
            "rfq_id": rfq_id,
            "carrier_name": "Demo Carrier A",
            "freight_charges": 12000.0,
            "origin_charges": 900.0,
            "destination_charges": 800.0,
            "total_price": 13700.0,
            "transit_time": 3,
            "validity": "7 days",
            "rank": 2,
            "created_at": now - timedelta(minutes=8),
        },
        {
            "rfq_id": rfq_id,
            "carrier_name": "Demo Carrier B",
            "freight_charges": 11500.0,
            "origin_charges": 850.0,
            "destination_charges": 700.0,
            "total_price": 13050.0,
            "transit_time": 4,
            "validity": "5 days",
            "rank": 1,
            "created_at": now - timedelta(minutes=4),
        },
    ]
    await bids_collection.insert_many(bid_docs)

    await activity_logs_collection.insert_many(
        [
            {
                "rfq_id": rfq_id,
                "event_type": "rfq_created",
                "description": "Demo RFQ seeded for evaluator walkthrough.",
                "metadata": {},
                "created_at": now - timedelta(minutes=20),
            },
            {
                "rfq_id": rfq_id,
                "event_type": "bid_submitted",
                "description": "Demo Carrier A submitted bid: ₹13,700.00",
                "metadata": {"carrier": "Demo Carrier A", "total_price": 13700.0},
                "created_at": now - timedelta(minutes=8),
            },
            {
                "rfq_id": rfq_id,
                "event_type": "time_extended",
                "description": "Auction extended by 5 min. New close updated due to recent bid in trigger window.",
                "metadata": {"reason": "Bid received from Demo Carrier B"},
                "created_at": now - timedelta(minutes=4),
            },
        ]
    )

    print("Demo seed complete.")
    print("Buyer login: demo_buyer / demo123")
    print("Supplier login: demo_supplier_a / demo123")
    print("Supplier login: demo_supplier_b / demo123")
    print(f"RFQ ID: {rfq_id}")
    print("Reference ID: RFQ-DEMO2026")


if __name__ == "__main__":
    asyncio.run(seed_demo())
