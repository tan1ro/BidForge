import asyncio
import httpx
from datetime import datetime, timezone, timedelta

async def run_e2e_test():
    base_url = "http://127.0.0.1:8001/api"
    
    async with httpx.AsyncClient(base_url=base_url) as client:
        print("1. Creating users...")
        rfqowner_cred = {"company_name": "E2Erfqowner", "email": "admin@e2erfqowner.com", "password": "password123", "role": "rfqowner"}
        s1_cred = {"company_name": "E2EBidder1", "email": "admin@e2ebidder1.com", "password": "password123", "role": "bidder"}
        s2_cred = {"company_name": "E2EBidder2", "email": "admin@e2ebidder2.com", "password": "password123", "role": "bidder"}

        for cred in [rfqowner_cred, s1_cred, s2_cred]:
            r = await client.post("/auth/signup", json=cred)
            if r.status_code == 409:
                print(f"User {cred['company_name']} already exists")
            else:
                assert r.status_code == 200, f"Signup failed: {r.text}"
                print(f"Created {cred['company_name']}")

        print("\n2. Logging in users...")
        def login_payload(cred):
            return {"company_name": cred["company_name"], "password": cred["password"]}
            
        r_rfqowner = await client.post("/auth/login", json=login_payload(rfqowner_cred))
        rfqowner_token = r_rfqowner.json()["access_token"]
        rfqowner_headers = {"Authorization": f"Bearer {rfqowner_token}"}
        
        r_s1 = await client.post("/auth/login", json=login_payload(s1_cred))
        s1_token = r_s1.json()["access_token"]
        s1_headers = {"Authorization": f"Bearer {s1_token}"}
        
        r_s2 = await client.post("/auth/login", json=login_payload(s2_cred))
        s2_token = r_s2.json()["access_token"]
        s2_headers = {"Authorization": f"Bearer {s2_token}"}
        
        print("\n3. Creating an RFQ...")
        now = datetime.now(timezone.utc)
        rfq_payload = {
            "name": "E2E Test RFQ",
            "material": "Test Material",
            "quantity": "10 MT",
            "pickup_location": "Location A",
            "delivery_location": "Location B",
            "bid_start_time": (now - timedelta(minutes=10)).isoformat(),
            "bid_close_time": (now + timedelta(minutes=5)).isoformat(),
            "forced_close_time": (now + timedelta(minutes=20)).isoformat(),
            "pickup_date": (now + timedelta(days=2)).isoformat(),
            "trigger_window_minutes": 10,
            "extension_duration_minutes": 5,
            "extension_trigger": "bid_received",
            "auction_type": "Reverse Auction (lowest wins)",
            "starting_price": 50000.0,
            "minimum_decrement": 1000.0,
        }
        r_rfq = await client.post("/rfqs", json=rfq_payload, headers=rfqowner_headers)
        assert r_rfq.status_code == 200, f"RFQ creation failed: {r_rfq.text}"
        rfq_id = r_rfq.json()["id"]
        print(f"Created RFQ with ID: {rfq_id}")
        
        print("\n4. Submitting bids...")
        bid1_payload = {
            "carrier_name": "E2EBidder1",
            "freight_charges": 45000.0,
            "origin_charges": 1000.0,
            "destination_charges": 1000.0,
            "transit_time": 2,
            "validity": "5 days",
            "vehicle_type": "Truck",
            "capacity_tons": 10,
            "insurance_included": True
        }
        r_bid1 = await client.post(f"/rfqs/{rfq_id}/bids", json=bid1_payload, headers=s1_headers)
        assert r_bid1.status_code == 200, f"Bid1 failed: {r_bid1.text}"
        print("Bidder 1 submitted bid 1: Total 47000")
        
        # This bid should trigger a time extension since it's within the trigger window of 10 minutes
        # Current close is now + 5 min, so we are in the trigger window!
        bid2_payload = {
            "carrier_name": "E2EBidder2",
            "freight_charges": 42000.0,
            "origin_charges": 1000.0,
            "destination_charges": 1000.0,
            "transit_time": 2,
            "validity": "5 days",
            "vehicle_type": "Truck",
            "capacity_tons": 10,
            "insurance_included": True
        }
        r_bid2 = await client.post(f"/rfqs/{rfq_id}/bids", json=bid2_payload, headers=s2_headers)
        assert r_bid2.status_code == 200, f"Bid2 failed: {r_bid2.text}"
        print("Bidder 2 submitted bid 2: Total 44000")
        
        print("\n5. Checking RFQ details for time extension...")
        r_get_rfq = await client.get(f"/rfqs/{rfq_id}", headers=rfqowner_headers)
        assert r_get_rfq.status_code == 200
        rfq_data = r_get_rfq.json()
        
        # Verify extension
        close_time_str = rfq_data["current_close_time"].replace('Z', '+00:00')
        close_time = datetime.fromisoformat(close_time_str)
        if close_time.tzinfo is None:
            close_time = close_time.replace(tzinfo=timezone.utc)
            
        original_close = datetime.fromisoformat(rfq_payload["bid_close_time"])
        if original_close.tzinfo is None:
            original_close = original_close.replace(tzinfo=timezone.utc)
            
        print(f"Original close time: {original_close}")
        print(f"Current close time: {close_time}")
        assert close_time > original_close, "Time extension did not occur!"
        print("Time extension triggered successfully!")
        
        print("\n6. Checking bid rankings...")
        r_bids = await client.get(f"/rfqs/{rfq_id}/bids", headers=rfqowner_headers)
        assert r_bids.status_code == 200
        bids = r_bids.json()["items"]
        for bid in bids:
            print(f"Bidder: {bid['carrier_name']}, Total: {bid['total_price']}, Rank: {bid['rank']}")
        assert bids[0]["carrier_name"] == "E2EBidder2", "Ranking is incorrect!"
        
        print("\n7. Force closing RFQ directly via DB to test award...")
        from motor.motor_asyncio import AsyncIOMotorClient
        client_db = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
        db = client_db["bidforge"]
        from bson import ObjectId
        past_time = datetime.now(timezone.utc) - timedelta(hours=1)
        await db.rfqs.update_one(
            {"_id": ObjectId(rfq_id)},
            {"$set": {
                "status": "force_closed", 
                "current_close_time": past_time,
                "forced_close_time": past_time,
                "bid_close_time": past_time
            }}
        )
        print("Force closed RFQ via DB")
        
        r_award = await client.post(f"/rfqs/{rfq_id}/award", json={"bid_id": bids[0]["id"], "award_note": "Best price"}, headers=rfqowner_headers)
        assert r_award.status_code == 200, f"Award failed: {r_award.text}"
        print("Awarded RFQ to best bidder")
        
        print("\nAll cases tested successfully! End-to-End Simulation Complete.")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
