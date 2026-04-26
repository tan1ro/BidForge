# British Auction RFQ System

A full-stack web application for managing Request for Quotation (RFQ) processes with **British Auction-style bidding**. Built with **FastAPI**, **MongoDB**, and **React**.

---

## Architecture (HLD)

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  (Vite + React Router)                               │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ RFQ List │  │ Create RFQ│  │ Auction Details  │  │
│  │  Page    │  │   Form    │  │ (Bids, Rankings, │  │
│  │          │  │           │  │  Activity, Timer) │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │  HTTP REST API (JSON)
                        ▼
┌─────────────────────────────────────────────────────┐
│                  FastAPI Backend                      │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ RFQ Routes │  │ Bid Routes │  │ Activity Log  │  │
│  │            │  │ + Auction  │  │   Routes      │  │
│  │ CRUD Ops   │  │ Extension  │  │               │  │
│  │            │  │   Logic    │  │               │  │
│  └────────────┘  └────────────┘  └───────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Motor (Async MongoDB Driver)                  │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                    MongoDB                           │
│                                                      │
│  Collections:                                        │
│  ┌──────┐  ┌──────┐  ┌───────────────┐              │
│  │ rfqs │  │ bids │  │ activity_logs │              │
│  └──────┘  └──────┘  └───────────────┘              │
└─────────────────────────────────────────────────────┘
```

---

## Schema Design

### `rfqs` Collection
| Field                      | Type     | Description                              |
|----------------------------|----------|------------------------------------------|
| `_id`                      | ObjectId | Primary key                              |
| `name`                     | string   | RFQ name                                 |
| `reference_id`             | string   | Auto-generated unique ID (e.g., RFQ-A1B2C3D4) |
| `bid_start_time`           | datetime | When bidding opens                       |
| `bid_close_time`           | datetime | Original close time                      |
| `current_close_time`       | datetime | Dynamic close (extends with triggers)    |
| `forced_close_time`        | datetime | Hard deadline — never exceeded            |
| `pickup_date`              | datetime | Service / pickup date                    |
| `trigger_window_minutes`   | int      | X minutes before close to monitor        |
| `extension_duration_minutes`| int     | Y minutes to extend when triggered       |
| `extension_trigger`        | enum     | `bid_received`, `rank_change`, `l1_change` |
| `status`                   | enum     | `upcoming`, `active`, `closed`, `force_closed` |
| `created_at`               | datetime | Creation timestamp                       |

### `bids` Collection
| Field                | Type     | Description                |
|----------------------|----------|----------------------------|
| `_id`                | ObjectId | Primary key                |
| `rfq_id`             | string   | Reference to RFQ           |
| `carrier_name`       | string   | Supplier / carrier name    |
| `freight_charges`    | float    | Freight cost               |
| `origin_charges`     | float    | Origin handling cost       |
| `destination_charges`| float    | Destination handling cost  |
| `total_price`        | float    | Sum of all charges         |
| `transit_time`       | int      | Days for delivery          |
| `validity`           | string   | Quote validity period      |
| `rank`               | int      | Current ranking (L1=lowest)|
| `created_at`         | datetime | Submission timestamp       |

### `activity_logs` Collection
| Field        | Type     | Description                            |
|--------------|----------|----------------------------------------|
| `_id`        | ObjectId | Primary key                            |
| `rfq_id`     | string   | Reference to RFQ                       |
| `event_type` | string   | `bid_submitted`, `time_extended`, etc. |
| `description`| string   | Human-readable log message             |
| `metadata`   | dict     | Additional data (old/new values)       |
| `created_at` | datetime | Event timestamp                        |

---

## API Endpoints

| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| POST   | `/api/auth/signup`        | Register a new user      |
| POST   | `/api/auth/login`         | Login and get JWT token  |
| GET    | `/api/rfqs`               | List RFQs (paginated)    |
| POST   | `/api/rfqs`               | Create new RFQ           |
| GET    | `/api/rfqs/{id}`          | Get RFQ details          |
| GET    | `/api/rfqs/{id}/bids`     | Get bids (paginated)     |
| POST   | `/api/rfqs/{id}/bids`     | Submit a bid             |
| GET    | `/api/rfqs/{id}/activity` | Get activity (paginated) |
| POST   | `/api/rfqs/{id}/pause`    | Pause RFQ (buyer)        |
| PATCH  | `/api/rfqs/{id}`          | Update RFQ (buyer)       |
| GET    | `/api/metrics/bids-per-rfq` | Bids count per RFQ (buyer) |
| GET    | `/api/metrics/avg-bids`   | Avg bids by auction type + period (buyer) |
| GET    | `/api/metrics/winning-price-trend` | Winning price trend by period (buyer) |
| GET    | `/api/metrics/extensions-per-rfq` | Extension count per RFQ (buyer) |
| WS     | `/api/ws/rfqs/{id}`       | Realtime RFQ events      |

---

## API Examples

### Create RFQ (Buyer)

```bash
curl -X POST http://localhost:8000/api/rfqs \
  -H "Authorization: Bearer <buyer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "West Zone Lane Movement",
    "bid_start_time": "2026-04-25T18:00:00Z",
    "bid_close_time": "2026-04-25T18:20:00Z",
    "forced_close_time": "2026-04-25T18:40:00Z",
    "pickup_date": "2026-04-27T06:00:00Z",
    "trigger_window_minutes": 10,
    "extension_duration_minutes": 5,
    "extension_trigger": "bid_received"
  }'
```

Example response:

```json
{
  "id": "680bc02f1f8d9a8a7372fd8a",
  "name": "West Zone Lane Movement",
  "reference_id": "RFQ-A1B2C3D4",
  "status": "upcoming",
  "current_close_time": "2026-04-25T18:20:00Z",
  "forced_close_time": "2026-04-25T18:40:00Z"
}
```

### Submit Bid (Supplier)

```bash
curl -X POST http://localhost:8000/api/rfqs/<rfq_id>/bids \
  -H "Authorization: Bearer <supplier_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "carrier_name": "Carrier Prime",
    "freight_charges": 12000,
    "origin_charges": 900,
    "destination_charges": 700,
    "transit_time": 3,
    "validity": "7 days"
  }'
```

Example response:

```json
{
  "id": "680bc0671f8d9a8a7372fd92",
  "rfq_id": "680bc02f1f8d9a8a7372fd8a",
  "carrier_name": "Carrier Prime",
  "total_price": 13600,
  "rank": 1
}
```

---

## British Auction Logic

1. **Trigger Window (X min)**: System monitors bidding activity X minutes before close
2. **Extension Duration (Y min)**: If triggered, close time extends by Y minutes
3. **Extension Triggers**:
   - `bid_received`: Any new bid in window extends auction
   - `rank_change`: Any supplier rank change extends auction
   - `l1_change`: Only L1 (lowest bidder) change extends auction
4. **Forced Close**: Extensions never exceed the forced close time

---

## Assignment Traceability Checklist

- RFQ creation supports all required fields including forced close and auction extension config.
- Validation rules enforce:
  - forced close must be greater than bid close
  - bid start must be before bid close
  - pickup date must be after bid start
  - non-negative bid components and total bid amount > 0
- Listing page shows RFQ name/ID, lowest bid, current close, forced close, and status.
- Details page shows sorted bids, L1/L2/L3 ranking, quote details, auction config, and activity timeline.
- Activity logs include bid submissions, extension events, and reason for each extension.
- HLD + schema + backend + frontend deliverables are documented in this README and implemented in code.

---

## Requirement To Implementation Matrix

| Requirement | File / Endpoint | Test / Evidence |
|-------------|-----------------|-----------------|
| Forced close validation | `POST /api/rfqs`, `PATCH /api/rfqs/{id}` in `backend/routes.py` | `backend/tests/test_auction_logic.py` + `backend/tests/test_routes_hardening.py` |
| L1 change extension trigger | `POST /api/rfqs/{id}/bids` in `backend/routes.py` (`l1_change` branch) | `backend/tests/test_routes_hardening.py::test_submit_bid_trigger_l1_change_calls_extension_only_on_l1_change` |
| Rank change extension trigger | `POST /api/rfqs/{id}/bids` in `backend/routes.py` (`rank_change` branch) | `backend/tests/test_routes_hardening.py::test_submit_bid_trigger_rank_change_calls_extension_only_on_rank_change` |
| Bid received extension trigger | `POST /api/rfqs/{id}/bids` in `backend/routes.py` (`bid_received` branch) | `backend/tests/test_routes_hardening.py::test_submit_bid_trigger_bid_received_calls_extension` |
| No extension outside trigger window | `check_and_extend_auction` in `backend/routes.py` | `backend/tests/test_routes_hardening.py::test_submit_bid_no_extension_outside_trigger_window` |
| Forced-close bid rejection path | `POST /api/rfqs/{id}/bids` in `backend/routes.py` | `backend/tests/test_routes_hardening.py::test_submit_bid_rejected_after_forced_close_and_status_transitions` |
| Activity reason logging | `activity_logs` collection via `log_activity`, `GET /api/rfqs/{id}/activity` | `frontend/src/pages/AuctionDetail.jsx` Activity tab + API route |
| Closed filter includes force-closed | `GET /api/rfqs?status=closed` in `backend/routes.py` | `backend/tests/test_routes_hardening.py::test_list_rfqs_closed_status_includes_force_closed` |
| Success metrics reporting | `/api/metrics/*` in `backend/routes.py`, buyer page `frontend/src/pages/BuyerMetrics.jsx` | `frontend/src/pages/BuyerMetrics.test.jsx` |
| Winner at close/force-close | `GET /api/rfqs/{id}` response (`winner_carrier`, `winning_bid_total`) and `frontend/src/pages/AuctionDetail.jsx` badge | `frontend/src/pages/AuctionDetail.test.jsx::shows winner badge for terminal auction state` |

---

## Setup & Run

### Prerequisites
- Python 3.9+
- Node.js 18+
- MongoDB running on `localhost:27017`

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Seed Demo Data (Optional)
```bash
cd backend
python seed_demo.py
```

This creates:
- buyer user: `demo_buyer / demo123`
- supplier users: `demo_supplier_a / demo123`, `demo_supplier_b / demo123`
- one active RFQ with bids + activity logs for evaluator walkthrough

### Run With Docker Compose (Optional)
```bash
docker compose up --build
```

Services:
- frontend: `http://localhost:5173`
- backend API/docs: `http://localhost:8000/docs`
- mongodb: `localhost:27017`

## Authentication

- Real persistent auth with MongoDB `users` collection.
- Signup creates a new `buyer` or `supplier` account.
- Login validates hashed password and returns JWT.
- Frontend stores token and sends it in `Authorization: Bearer <token>`.

## Authorization Matrix

- `buyer`: create/delete/update/pause RFQs, view RFQs, bids, activity, and metrics.
- `supplier`: submit bids, view RFQs, bids, and activity.

Activity visibility decision: **both buyer and supplier can view activity logs**.

## Realtime + Scheduler

- Frontend detail page subscribes to websocket updates (`/api/ws/rfqs/{id}`) for bid/status changes.
- Websocket handshake now requires JWT via subprotocol (`["token", "<jwt>"]`); unauthenticated connections are rejected.
- Backend scheduler runs every 5s to proactively update auction status transitions (`upcoming -> active -> closed/force_closed`) even without read traffic.

## Security Hardening Included

- JWT-based access control with route guards.
- Bid ownership is bound to the authenticated supplier identity (`user.username`) instead of trusting client-provided bidder identity.
- In-memory per-IP+path rate limiting middleware.
- Environment-driven CORS (`CORS_ORIGINS`).
- Structured audit logging (`audit_logs` collection) for key actions.
- Request correlation is supported via `X-Request-ID` header propagation.

## Pagination

- `/api/rfqs`, `/api/rfqs/{id}/bids`, and `/api/rfqs/{id}/activity` support:
  - `page` (default 1)
  - `page_size` (default 20, max 100)
- Response shape:
  - `items`, `total`, `page`, `page_size`, `has_next`
- Closed filter semantics:
  - `GET /api/rfqs?status=closed` returns both `closed` and `force_closed` server-side.

## Hardening Notes

- `bids` collection enforces one active quote per supplier per RFQ using unique index: `("rfq_id", 1), ("carrier_name", 1)`.
- Bid submission includes deterministic close-window guards with structured error codes for force-close and current-close violations.
- Bid submission uses transaction-first persistence with retry fallback for non-transactional Mongo deployments.
- `minimum_decrement` must remain lower than `starting_price` to avoid impossible bidding progression.
- Auction detail countdown uses backend `server_time` offset to reduce client clock drift effects.

## Testing

### Backend
```bash
cd backend
pytest
```

### Frontend
```bash
cd frontend
npm run test
npm run lint
npm run build
```

## How to Verify British Auction Behavior

1. Login as buyer and create an RFQ with:
   - `trigger_window_minutes = 10`
   - `extension_duration_minutes = 5`
   - a `forced_close_time` that is later than close time
2. Open RFQ details in buyer view (watch current close time and activity logs).
3. Login as supplier and submit bids during the last 10 minutes.
4. Confirm:
   - current close extends by 5 minutes when trigger condition matches
   - extension reason appears in activity log (`time_extended`)
   - current close never moves beyond forced close
5. Continue bidding until forced close is reached.
6. Verify new bids are rejected once auction is not active.

## Success Metrics Endpoints

Buyer-only metrics exposed under `/api/metrics/*`:

- `/api/metrics/bids-per-rfq`: total bids per RFQ.
- `/api/metrics/avg-bids?period=day|week|month`: average bids grouped by auction type and period bucket.
- `/api/metrics/winning-price-trend?period=day|week|month`: trend of final winning price in terminal auctions.
- `/api/metrics/extensions-per-rfq`: extension event count per RFQ.

Frontend page: `Metrics` nav (buyer only), implemented in `frontend/src/pages/BuyerMetrics.jsx`.

## Role-Wise Acceptance Flow

### Buyer Flow

1. Login as buyer and create a British Auction RFQ with:
   - `trigger_window_minutes = 10`
   - `extension_duration_minutes = 5`
   - `forced_close_time > bid_close_time`
2. Open RFQ detail page and observe:
   - status transitions (`upcoming -> active -> closed/force_closed`)
   - activity entries for bid submissions and extension reasons
3. If a bid is received inside trigger window and trigger condition matches:
   - `current_close_time` extends by configured duration
   - never exceeds `forced_close_time`
4. For terminal status (`closed` / `force_closed`), verify winner badge and winning total are visible.
5. Open `Metrics` page and verify all four success-metrics sections render with data.

### Supplier Flow

1. Login as supplier and open active RFQ detail.
2. Submit bids and revise bids:
   - confirm accepted only when RFQ status is `active`
   - confirm rejection after forced close boundary.
3. Open Activity tab (supplier-visible) and verify extension and bid timeline entries.
4. Validate trigger behavior with buyer:
   - `bid_received`: any in-window bid extends
   - `rank_change`: extension only when rank order changes
   - `l1_change`: extension only when lowest bidder changes

## CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs:
- backend tests
- frontend lint
- frontend tests
- frontend production build

---

## Tech Stack
- **Backend**: FastAPI + Motor (async MongoDB)
- **Frontend**: React + Vite + React Router
- **Database**: MongoDB
- **Styling**: Vanilla CSS with modern dark theme
