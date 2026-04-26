# BidForge High-Level Design (HLD)

## 1) Objective

Build a simplified RFQ platform that supports British Auction behavior:

- Open supplier bidding with real-time ranking
- Automatic auction extension near close time
- Hard stop at forced close time
- Transparent activity timeline and buyer-facing metrics

## 2) System Context

### Actors

- Buyer: creates and manages RFQs, monitors auctions, views metrics
- Supplier: submits/revises bids during active window

### Core Flows

1. Buyer creates RFQ with auction configuration.
2. Suppliers submit bids during active auction window.
3. System recalculates rank and applies extension rules when triggered.
4. Auction closes at current close or force-closes at forced close.
5. Buyer reviews winner, timeline, and summary metrics.

## 3) Architecture Overview

The system follows a standard 3-tier architecture:

- Frontend (React + Vite + MUI)
  - Pages: RFQ listing, RFQ creation, auction detail, buyer metrics
  - Uses REST APIs for CRUD and WebSocket for live updates
- Backend (FastAPI)
  - Auth, RFQ lifecycle, bid submission, extension logic, metrics, audit
  - Scheduler process updates auction status transitions
- Data Layer (MongoDB)
  - Collections for users, RFQs, bids, activity logs, audit logs

## 4) Component Responsibilities

### Frontend

- `frontend/src/pages/CreateRFQ.jsx`
  - RFQ creation form with validation and extension config
- `frontend/src/pages/RFQList.jsx`
  - Auction listing with status, lowest bid, close times
- `frontend/src/pages/AuctionDetail.jsx`
  - Bid table, L1/L2 rank view, activity log, auction configuration
- `frontend/src/pages/BuyerMetrics.jsx`
  - Buyer metrics visualization from backend metric endpoints

### Backend

- `backend/main.py`
  - FastAPI app setup, middleware, scheduler bootstrap
- `backend/auth.py` and `backend/auth_routes.py`
  - JWT-based signup/login/profile and role checks
- `backend/routes.py`
  - RFQ APIs, bid APIs, activity APIs, metrics APIs, WebSocket endpoint
  - Core British Auction extension and validation logic
- `backend/scheduler.py`
  - Periodic status transitions and WebSocket status broadcasts
- `backend/ws_manager.py`
  - Connection and broadcast manager per RFQ room

### Database

- `backend/database.py`
  - Mongo client/collections and index initialization

## 5) Key Business Rules

1. `forced_close_time` must be greater than `bid_close_time`.
2. Auction extension is checked only inside trigger window (`X` minutes).
3. Each extension adds `Y` minutes, but never beyond forced close.
4. Bid acceptance is blocked once current close or forced close is reached.
5. Extension trigger type is configurable per RFQ:
   - `bid_received`
   - `rank_change`
   - `l1_change`

## 6) API Surface (High Level)

- Auth:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- RFQ and auction:
  - `POST /api/rfqs`, `GET /api/rfqs`, `GET /api/rfqs/{rfq_id}`
  - `PATCH /api/rfqs/{rfq_id}`, `DELETE /api/rfqs/{rfq_id}`
  - `POST /api/rfqs/{rfq_id}/pause`
- Bids and activity:
  - `POST /api/rfqs/{rfq_id}/bids`, `GET /api/rfqs/{rfq_id}/bids`
  - `GET /api/rfqs/{rfq_id}/activity`
- Metrics:
  - `GET /api/metrics/bids-per-rfq`
  - `GET /api/metrics/avg-bids`
  - `GET /api/metrics/winning-price-trend`
  - `GET /api/metrics/extensions-per-rfq`
- Realtime:
  - `WS /api/ws/rfqs/{rfq_id}`

## 7) Non-Functional Considerations

- Security: JWT auth, role-based access, CORS control
- Reliability: periodic scheduler for status correctness
- Auditability: activity logs + audit logs for critical actions
- Performance: collection indexes for frequent queries
- Scalability: stateless APIs; can add Redis/pub-sub for distributed WebSocket broadcast if needed

## 8) Deployment View (Simple)

- Frontend and backend are independent services.
- Backend communicates with MongoDB.
- Users access frontend in browser; frontend calls backend over HTTP and WebSocket.

## 9) Existing Visual Diagrams

- `frontend/src/assets/diagram-system.svg`
- `frontend/src/assets/diagram-flow.svg`

This HLD complements those diagrams with written architecture and rule definitions.
