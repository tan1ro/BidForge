# BidForge - British Auction RFQ System

BidForge is a full-stack RFQ platform with British Auction-style bidding, built with FastAPI, MongoDB, and React.

## Features

- Buyer and supplier authentication with JWT.
- RFQ creation with auction rules (`trigger_window_minutes`, `extension_duration_minutes`, `extension_trigger`, forced close).
- Dynamic auction status transitions (`upcoming`, `active`, `paused`, `closed`, `force_closed`).
- Bid submission and revision with rank recalculation.
- Time-extension logic with three trigger types: `bid_received`, `rank_change`, and `l1_change`.
- Activity timeline and buyer-only analytics.
- WebSocket updates for live bid/rank changes.
- Basic security hardening: CORS config, rate limiting, audit logs, request ID propagation.

## Tech Stack

- Backend: FastAPI, Motor (async MongoDB driver), Pydantic, python-jose.
- Frontend: React + Vite.
- Database: MongoDB.

## Project Structure

- `backend/` - API, auth, auction rules, scheduler, tests.
- `frontend/` - React app for buyer/supplier workflows.

## Homepage, Logo, and Diagrams

- Public home page is available at `http://localhost:5173/`.
- Login action is available on the home page using the **Login** button.
- App logo file: `frontend/src/assets/bidforge-logo.svg`.
- Diagram files:
  - `frontend/src/assets/diagram-system.svg`
  - `frontend/src/assets/diagram-flow.svg`

## Prerequisites

- Python 3.9+
- Node.js 18+
- MongoDB (local or Atlas)

## Environment Variables

Create `backend/.env`:

```env
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=british_auction_rfq
JWT_SECRET=change-me-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=120
RATE_LIMIT_PER_MINUTE=120
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

## Local Development

### 1) Run backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 2) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Demo Data (Optional)

```bash
cd backend
python seed_demo.py
```

Creates:

- buyer: `demo_buyer / demo123`
- suppliers: `demo_supplier_a / demo123`, `demo_supplier_b / demo123`

## Running Tests

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

## API Overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### RFQ and bids

- `GET /api/rfqs`
- `POST /api/rfqs` (buyer)
- `GET /api/rfqs/{rfq_id}`
- `PATCH /api/rfqs/{rfq_id}` (buyer)
- `DELETE /api/rfqs/{rfq_id}` (buyer)
- `POST /api/rfqs/{rfq_id}/pause` (buyer)
- `POST /api/rfqs/{rfq_id}/bids` (supplier)
- `GET /api/rfqs/{rfq_id}/bids`
- `GET /api/rfqs/{rfq_id}/activity`

### Metrics (buyer only)

- `GET /api/metrics/bids-per-rfq`
- `GET /api/metrics/avg-bids?period=day|week|month`
- `GET /api/metrics/winning-price-trend?period=day|week|month`
- `GET /api/metrics/extensions-per-rfq`

### WebSocket

- `WS /api/ws/rfqs/{rfq_id}`
- Client must pass JWT as subprotocol: `["token", "<jwt>"]`.

## British Auction Rules Implemented

- RFQ closes at `current_close_time` unless extended.
- Extension is considered only in the configured trigger window before close.
- If triggered, close time extends by `extension_duration_minutes`.
- `current_close_time` never exceeds `forced_close_time`.
- Bidding is rejected after current close or forced close.

## Pagination

These endpoints support pagination:

- `GET /api/rfqs`
- `GET /api/rfqs/{rfq_id}/bids`
- `GET /api/rfqs/{rfq_id}/activity`

Query params:

- `page` (default `1`)
- `page_size` (default `20`, max `100`)

Response shape:

- `items`, `total`, `page`, `page_size`, `has_next`
