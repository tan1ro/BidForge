"""
seed_full.py — Comprehensive mock data seed for BidForge
Creates 1 rfqowner + 6 bidders + 7 RFQs covering every auction state and bid scenario.

Run:
    cd backend && python seed_full.py
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from auth import UserRole, hash_password
from database import (
    activity_logs_collection,
    bids_collection,
    bid_revisions_collection,
    rfqs_collection,
    users_collection,
)

# ─── Seed identity tags ──────────────────────────────────────────────────────
SEED_TAG = "__seed_full__"

NOW = datetime.now(timezone.utc)


def ref():
    return f"RFQ-{uuid.uuid4().hex[:8].upper()}"


def mk_log(rfq_id, event_type, desc, meta=None, offset_minutes=0):
    return {
        "rfq_id": rfq_id,
        "event_type": event_type,
        "description": desc,
        "metadata": meta or {},
        "created_at": NOW - timedelta(minutes=offset_minutes),
    }


# ─── Users ───────────────────────────────────────────────────────────────────

USERS = [
    # 1 rfqowner
    {
        "username": "Globalrfqowner",
        "email": "admin@globalrfqowner.com",
        "password_hash": hash_password("rfqowner@123"),
        "role": UserRole.RFQOWNER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=30),
    },
    # 6 bidders
    {
        "username": "SwiftLogistics",
        "email": "ops@swiftlogistics.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=28),
    },
    {
        "username": "ApexFreight",
        "email": "bid@apexfreight.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=27),
    },
    {
        "username": "NovaTrans",
        "email": "hello@novatrans.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=26),
    },
    {
        "username": "BlueSkyShipping",
        "email": "contact@blueskyshipping.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=25),
    },
    {
        "username": "PrimeCarriers",
        "email": "support@primecarriers.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=24),
    },
    {
        "username": "ZenithMove",
        "email": "info@zenithmove.com",
        "password_hash": hash_password("bidder@123"),
        "role": UserRole.BIDDER.value,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(days=23),
    },
]

# ─── RFQ + Bid factory ────────────────────────────────────────────────────────

def base_rfq(name, status, bid_start_offset, bid_close_offset, forced_close_offset,
             pickup_offset_days=5, trigger=10, ext=5, starting=50000, decrement=500,
             extension_trigger="bid_received",
             auction_type="Reverse Auction (lowest wins)", is_paused=False,
             material="Steel Coils", quantity="20 MT",
             pickup="Mumbai, MH", delivery="Pune, MH",
             loading_notes=""):
    bid_start = NOW + timedelta(minutes=bid_start_offset)
    bid_close = NOW + timedelta(minutes=bid_close_offset)
    forced_close = NOW + timedelta(minutes=forced_close_offset)
    pickup_date = NOW + timedelta(days=pickup_offset_days)
    return {
        "name": name,
        "created_by": "Globalrfqowner",
        "reference_id": ref(),
        "material": material,
        "quantity": quantity,
        "pickup_location": pickup,
        "delivery_location": delivery,
        "bid_start_time": bid_start,
        "bid_close_time": bid_close,
        "current_close_time": bid_close,
        "forced_close_time": forced_close,
        "pickup_date": pickup_date,
        "trigger_window_minutes": trigger,
        "extension_duration_minutes": ext,
        "extension_trigger": extension_trigger,
        "auction_type": auction_type,
        "starting_price": starting,
        "minimum_decrement": decrement,
        "technical_specs_attachment": "",
        "technical_specs_url": "",
        "technical_specs_file_name": "",
        "technical_specs_content_type": "",
        "technical_specs_file_size_bytes": 0,
        "loading_unloading_notes": loading_notes,
        "awarded_bidder": None,
        "awarded_bid_id": None,
        "awarded_at": None,
        "award_note": None,
        "is_paused": is_paused,
        "status": status,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(hours=2),
    }


def mk_bid(rfq_id, carrier, freight, origin, dest, transit, validity, rank,
           offset_minutes=0, vehicle="20ft Container", capacity=20.0, insurance=False,
           display_name=None):
    total = freight + origin + dest
    return {
        "rfq_id": rfq_id,
        "carrier_name": carrier,
        "carrier_display_name": display_name or carrier,
        "freight_charges": freight,
        "origin_charges": origin,
        "destination_charges": dest,
        "total_price": total,
        "transit_time": transit,
        "validity": validity,
        "vehicle_type": vehicle,
        "capacity_tons": capacity,
        "insurance_included": insurance,
        "rank": rank,
        "seed": SEED_TAG,
        "created_at": NOW - timedelta(minutes=offset_minutes),
    }


# ─── Main seed ────────────────────────────────────────────────────────────────

async def seed():
    print("🧹  Cleaning up previous seed data …")
    await users_collection.delete_many({"seed": SEED_TAG})
    await rfqs_collection.delete_many({"seed": SEED_TAG})
    # Clean bids/logs by rfq_id after rfqs are deleted
    await bids_collection.delete_many({"seed": SEED_TAG})
    await activity_logs_collection.delete_many({"seed": SEED_TAG})
    await bid_revisions_collection.delete_many({"seed": SEED_TAG})

    # ── Insert users ──────────────────────────────────────────────────────────
    print("👤  Inserting users …")
    await users_collection.insert_many(USERS)

    logs = []

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 1 — UPCOMING  (starts 2 h from now, no bids)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq1 = base_rfq(
        name="[UPCOMING] Bangalore to Chennai – Auto Parts",
        status="upcoming",
        bid_start_offset=+120,   # 2 h later
        bid_close_offset=+240,
        forced_close_offset=+300,
        pickup_offset_days=7,
        material="Automotive Parts",
        quantity="15 MT",
        pickup="Bangalore, KA",
        delivery="Chennai, TN",
        starting=45000,
        decrement=500,
    )
    r1 = await rfqs_collection.insert_one(rfq1)
    rid1 = str(r1.inserted_id)
    logs += [
        mk_log(rid1, "rfq_created", "RFQ created. Auction starts in 2 hours.", offset_minutes=120),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 2 — ACTIVE  (started 30 min ago, closes in 30 min, 3 bids)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq2 = base_rfq(
        name="[ACTIVE] Mumbai to Delhi – Pharma Goods",
        status="active",
        bid_start_offset=-30,
        bid_close_offset=+30,
        forced_close_offset=+90,
        pickup_offset_days=4,
        material="Pharmaceutical Goods",
        quantity="5 MT",
        pickup="Mumbai, MH",
        delivery="New Delhi, DL",
        starting=80000,
        decrement=1000,
        extension_trigger="l1_change",
    )
    r2 = await rfqs_collection.insert_one(rfq2)
    rid2 = str(r2.inserted_id)

    b2 = await bids_collection.insert_many([
        mk_bid(rid2, "SwiftLogistics",  62000, 2000, 1500, 3, "15 days", 2, offset_minutes=25, insurance=True),
        mk_bid(rid2, "ApexFreight",     59000, 2500, 2000, 4, "10 days", 1, offset_minutes=15, insurance=False),
        mk_bid(rid2, "NovaTrans",       65000, 1800, 1700, 5, "7 days",  3, offset_minutes=5,  insurance=True),
    ])
    logs += [
        mk_log(rid2, "rfq_created",   "RFQ created. Auction is now active.", offset_minutes=30),
        mk_log(rid2, "auction_started", "Auction is now active and accepting bids.", offset_minutes=30),
        mk_log(rid2, "bid_submitted", "SwiftLogistics submitted bid: ₹65,500.00", {"carrier": "SwiftLogistics", "total_price": 65500}, offset_minutes=25),
        mk_log(rid2, "bid_submitted", "ApexFreight submitted bid: ₹63,500.00", {"carrier": "ApexFreight", "total_price": 63500}, offset_minutes=15),
        mk_log(rid2, "bid_submitted", "NovaTrans submitted bid: ₹68,500.00", {"carrier": "NovaTrans", "total_price": 68500}, offset_minutes=5),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 3 — ACTIVE with TIME EXTENSIONS  (in trigger window, bids close in 8 min)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq3 = base_rfq(
        name="[ACTIVE + EXTENDED] Hyderabad to Kolkata – Electronics",
        status="active",
        bid_start_offset=-60,
        bid_close_offset=+8,      # within 10-min trigger window
        forced_close_offset=+120,
        pickup_offset_days=6,
        material="Consumer Electronics",
        quantity="8 MT",
        pickup="Hyderabad, TS",
        delivery="Kolkata, WB",
        starting=120000,
        decrement=2000,
        extension_trigger="bid_received",
        trigger=10,
        ext=5,
    )
    # Simulate current_close already extended once
    rfq3["current_close_time"] = NOW + timedelta(minutes=8)
    r3 = await rfqs_collection.insert_one(rfq3)
    rid3 = str(r3.inserted_id)

    await bids_collection.insert_many([
        mk_bid(rid3, "BlueSkyShipping", 95000, 3000, 2500, 2, "14 days", 2, offset_minutes=50, insurance=True),
        mk_bid(rid3, "PrimeCarriers",   88000, 3500, 3000, 3, "10 days", 1, offset_minutes=12, insurance=True),
        mk_bid(rid3, "ZenithMove",     100000, 2500, 2000, 4, "7 days",  3, offset_minutes=8, insurance=False),
        mk_bid(rid3, "SwiftLogistics",  90000, 3200, 2800, 3, "12 days", 2, offset_minutes=6, insurance=True),
    ])
    logs += [
        mk_log(rid3, "rfq_created",    "RFQ created.", offset_minutes=60),
        mk_log(rid3, "auction_started","Auction is now active.", offset_minutes=60),
        mk_log(rid3, "bid_submitted",  "BlueSkyShipping submitted bid: ₹1,00,500.00", offset_minutes=50),
        mk_log(rid3, "bid_submitted",  "PrimeCarriers submitted bid: ₹94,500.00", offset_minutes=12),
        mk_log(rid3, "time_extended",
               "Auction extended by 5 min due to bid in trigger window.",
               {"reason": "Bid received from PrimeCarriers", "old_close": (NOW + timedelta(minutes=3)).isoformat(),
                "new_close": (NOW + timedelta(minutes=8)).isoformat()}, offset_minutes=12),
        mk_log(rid3, "bid_submitted",  "ZenithMove submitted bid: ₹1,04,500.00", offset_minutes=8),
        mk_log(rid3, "bid_submitted",  "SwiftLogistics revised bid: ₹96,000.00", offset_minutes=6),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 4 — PAUSED  (paused mid-auction)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq4 = base_rfq(
        name="[PAUSED] Surat to Ahmedabad – Textile Yarn",
        status="paused",
        bid_start_offset=-45,
        bid_close_offset=+60,
        forced_close_offset=+180,
        pickup_offset_days=5,
        material="Textile Yarn",
        quantity="30 MT",
        pickup="Surat, GJ",
        delivery="Ahmedabad, GJ",
        starting=35000,
        decrement=300,
        is_paused=True,
    )
    r4 = await rfqs_collection.insert_one(rfq4)
    rid4 = str(r4.inserted_id)

    await bids_collection.insert_many([
        mk_bid(rid4, "ApexFreight",  28000, 1200, 800, 2, "7 days", 1, offset_minutes=30, vehicle="Truck 10T"),
        mk_bid(rid4, "NovaTrans",    30000, 1000, 900, 3, "5 days", 2, offset_minutes=20, vehicle="Truck 10T"),
    ])
    logs += [
        mk_log(rid4, "rfq_created",    "RFQ created.", offset_minutes=45),
        mk_log(rid4, "auction_started","Auction is now active.", offset_minutes=45),
        mk_log(rid4, "bid_submitted",  "ApexFreight submitted bid: ₹30,000.00", offset_minutes=30),
        mk_log(rid4, "bid_submitted",  "NovaTrans submitted bid: ₹31,900.00", offset_minutes=20),
        mk_log(rid4, "auction_paused", "rfqowner paused the auction for review.", {"reason": "Document verification pending"}, offset_minutes=10),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 5 — CLOSED  (closed at scheduled time, 4 bids, no award yet)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq5 = base_rfq(
        name="[CLOSED] Jaipur to Lucknow – FMCG",
        status="closed",
        bid_start_offset=-180,
        bid_close_offset=-10,      # closed 10 min ago
        forced_close_offset=+60,
        pickup_offset_days=3,
        material="FMCG Goods",
        quantity="12 MT",
        pickup="Jaipur, RJ",
        delivery="Lucknow, UP",
        starting=42000,
        decrement=400,
        loading_notes="Fragile items – handle with care",
    )
    rfq5["current_close_time"] = NOW - timedelta(minutes=10)
    r5 = await rfqs_collection.insert_one(rfq5)
    rid5 = str(r5.inserted_id)

    await bids_collection.insert_many([
        mk_bid(rid5, "ZenithMove",     33000, 1500, 1200, 2, "10 days", 3, offset_minutes=160, insurance=False),
        mk_bid(rid5, "SwiftLogistics", 31000, 1400, 1100, 3, "7 days",  2, offset_minutes=140),
        mk_bid(rid5, "PrimeCarriers",  29500, 1300, 1000, 4, "14 days", 1, offset_minutes=120, insurance=True),
        mk_bid(rid5, "BlueSkyShipping",35000, 1600, 1300, 2, "5 days",  4, offset_minutes=100),
    ])
    logs += [
        mk_log(rid5, "rfq_created",    "RFQ created.", offset_minutes=180),
        mk_log(rid5, "auction_started","Auction is now active.", offset_minutes=180),
        mk_log(rid5, "bid_submitted",  "ZenithMove submitted bid: ₹35,700.00", offset_minutes=160),
        mk_log(rid5, "bid_submitted",  "SwiftLogistics submitted bid: ₹33,500.00", offset_minutes=140),
        mk_log(rid5, "time_extended",  "Auction extended by 5 min.", offset_minutes=140),
        mk_log(rid5, "bid_submitted",  "PrimeCarriers submitted bid: ₹31,800.00", offset_minutes=120),
        mk_log(rid5, "bid_submitted",  "BlueSkyShipping submitted bid: ₹37,900.00", offset_minutes=100),
        mk_log(rid5, "auction_closed", "Auction closed at scheduled close time.", offset_minutes=10),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 6 — FORCE_CLOSED + AWARDED  (hard deadline hit, winner awarded)
    # ═══════════════════════════════════════════════════════════════════════════
    rfq6 = base_rfq(
        name="[FORCE CLOSED + AWARDED] Coimbatore to Chennai – Machinery",
        status="force_closed",
        bid_start_offset=-300,
        bid_close_offset=-120,
        forced_close_offset=-30,  # force-closed 30 min ago
        pickup_offset_days=2,
        material="Heavy Machinery",
        quantity="50 MT",
        pickup="Coimbatore, TN",
        delivery="Chennai, TN",
        starting=200000,
        decrement=3000,
        loading_notes="Requires crane loading",
    )
    rfq6["current_close_time"] = NOW - timedelta(minutes=120)
    rfq6["forced_close_time"] = NOW - timedelta(minutes=30)
    # Will be updated with awarded info after bid insertion
    r6 = await rfqs_collection.insert_one(rfq6)
    rid6 = str(r6.inserted_id)

    b6_list = [
        mk_bid(rid6, "ApexFreight",    155000, 5000, 4000, 2, "21 days", 2, offset_minutes=280, insurance=True),
        mk_bid(rid6, "NovaTrans",      148000, 5500, 4500, 3, "14 days", 1, offset_minutes=250, insurance=True),
        mk_bid(rid6, "ZenithMove",     162000, 4500, 3500, 2, "10 days", 3, offset_minutes=220, insurance=False),
        mk_bid(rid6, "SwiftLogistics", 170000, 4000, 3000, 4, "7 days",  4, offset_minutes=200),
        mk_bid(rid6, "BlueSkyShipping",145000, 6000, 5000, 2, "21 days", 1, offset_minutes=140, insurance=True),
    ]
    b6_result = await bids_collection.insert_many(b6_list)

    # Award to lowest: BlueSkyShipping @ ₹1,56,000
    winning_bid_id = str(b6_result.inserted_ids[4])
    award_time = NOW - timedelta(minutes=25)
    await rfqs_collection.update_one(
        {"_id": r6.inserted_id},
        {"$set": {
            "awarded_bidder": "BlueSkyShipping",
            "awarded_bid_id": winning_bid_id,
            "awarded_at": award_time,
            "award_note": "Best price with insurance included and fastest delivery.",
        }}
    )
    logs += [
        mk_log(rid6, "rfq_created",    "RFQ created.", offset_minutes=300),
        mk_log(rid6, "auction_started","Auction is now active.", offset_minutes=300),
        mk_log(rid6, "bid_submitted",  "ApexFreight submitted bid: ₹1,64,000.00", offset_minutes=280),
        mk_log(rid6, "bid_submitted",  "NovaTrans submitted bid: ₹1,58,000.00", offset_minutes=250),
        mk_log(rid6, "bid_submitted",  "ZenithMove submitted bid: ₹1,70,000.00", offset_minutes=220),
        mk_log(rid6, "bid_submitted",  "SwiftLogistics submitted bid: ₹1,77,000.00", offset_minutes=200),
        mk_log(rid6, "bid_submitted",  "BlueSkyShipping submitted bid: ₹1,56,000.00 [LOWEST]", offset_minutes=140),
        mk_log(rid6, "auction_closed", "Auction closed at scheduled time.", offset_minutes=120),
        mk_log(rid6, "auction_closed", "Auction force-closed at hard deadline.", offset_minutes=30),
        mk_log(rid6, "award_issued",
               "Contract awarded to BlueSkyShipping at ₹1,56,000.00.",
               {"awarded_to": "BlueSkyShipping", "total_price": 156000, "note": "Best price with insurance."}, offset_minutes=25),
    ]

    # ═══════════════════════════════════════════════════════════════════════════
    # RFQ 7 — ACTIVE, SEALED BID TYPE (no extensions), many bidders, masked visibility
    # ═══════════════════════════════════════════════════════════════════════════
    rfq7 = base_rfq(
        name="[ACTIVE – SEALED BID] Nagpur to Indore – Cold Chain",
        status="active",
        bid_start_offset=-90,
        bid_close_offset=+30,
        forced_close_offset=+120,
        pickup_offset_days=3,
        material="Cold Chain / Frozen Goods",
        quantity="10 MT",
        pickup="Nagpur, MH",
        delivery="Indore, MP",
        starting=70000,
        decrement=1000,
        auction_type="Sealed Bid",
        extension_trigger="bid_received",
        trigger=10,
        ext=5,
    )
    r7 = await rfqs_collection.insert_one(rfq7)
    rid7 = str(r7.inserted_id)

    await bids_collection.insert_many([
        mk_bid(rid7, "PrimeCarriers",   55000, 2000, 1500, 2, "10 days", 2, offset_minutes=80, vehicle="Reefer Truck"),
        mk_bid(rid7, "ZenithMove",      52000, 2200, 1800, 3, "7 days",  1, offset_minutes=70, vehicle="Reefer Truck", insurance=True),
        mk_bid(rid7, "ApexFreight",     58000, 1800, 1400, 2, "14 days", 3, offset_minutes=60, vehicle="Reefer Truck"),
        mk_bid(rid7, "NovaTrans",       60000, 1500, 1200, 4, "5 days",  4, offset_minutes=50, vehicle="Reefer Truck"),
        mk_bid(rid7, "SwiftLogistics",  54000, 1900, 1600, 3, "10 days", 2, offset_minutes=40, vehicle="Reefer Truck", insurance=True),
        mk_bid(rid7, "BlueSkyShipping", 51000, 2300, 2000, 2, "14 days", 1, offset_minutes=30, vehicle="Reefer Truck", insurance=True),
    ])
    logs += [
        mk_log(rid7, "rfq_created",    "RFQ created. Sealed bid – no extensions.", offset_minutes=90),
        mk_log(rid7, "auction_started","Auction is now active.", offset_minutes=90),
        mk_log(rid7, "bid_submitted",  "PrimeCarriers submitted sealed bid.", offset_minutes=80),
        mk_log(rid7, "bid_submitted",  "ZenithMove submitted sealed bid.", offset_minutes=70),
        mk_log(rid7, "bid_submitted",  "ApexFreight submitted sealed bid.", offset_minutes=60),
        mk_log(rid7, "bid_submitted",  "NovaTrans submitted sealed bid.", offset_minutes=50),
        mk_log(rid7, "bid_submitted",  "SwiftLogistics submitted sealed bid.", offset_minutes=40),
        mk_log(rid7, "bid_submitted",  "BlueSkyShipping submitted sealed bid.", offset_minutes=30),
    ]

    # ── Flush logs ────────────────────────────────────────────────────────────
    for log in logs:
        log["seed"] = SEED_TAG
    await activity_logs_collection.insert_many(logs)

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n✅  Seed complete!\n")
    print("=" * 60)
    print("  USERS")
    print("=" * 60)
    print("  Role     | Company          | Password")
    print("  ---------|------------------|-------------")
    print("  rfqowner    | Globalrfqowner      | rfqowner@123")
    print("  Bidder | SwiftLogistics   | bidder@123")
    print("  Bidder | ApexFreight      | bidder@123")
    print("  Bidder | NovaTrans        | bidder@123")
    print("  Bidder | BlueSkyShipping  | bidder@123")
    print("  Bidder | PrimeCarriers    | bidder@123")
    print("  Bidder | ZenithMove       | bidder@123")
    print()
    print("=" * 60)
    print("  AUCTIONS CREATED")
    print("=" * 60)
    statuses = [
        ("UPCOMING",               rid1, "No bids – starts in 2 h"),
        ("ACTIVE",                 rid2, "3 bids – L1 change trigger"),
        ("ACTIVE + EXTENSIONS",    rid3, "4 bids – in trigger window, masked"),
        ("PAUSED",                 rid4, "2 bids – paused mid-auction"),
        ("CLOSED",                 rid5, "4 bids – awaiting award"),
        ("FORCE CLOSED + AWARDED", rid6, "5 bids – BlueSkyShipping won"),
        ("ACTIVE – SEALED BID",    rid7, "6 bids – masked, no extensions"),
    ]
    for label, rid, note in statuses:
        print(f"  [{label}]")
        print(f"    RFQ ID : {rid}")
        print(f"    Note   : {note}")
        print()


if __name__ == "__main__":
    asyncio.run(seed())
