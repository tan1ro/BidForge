# BidForge - Complete Application Documentation

Use this as the single source of truth for your project write-up.  
All Mermaid blocks below are ready to paste into Mermaid Live Editor or Markdown renderers that support Mermaid.

---

## 1) Project Overview

### 1.1 Problem Statement

<!-- Write what procurement/logistics problem BidForge solves -->

### 1.2 Solution Summary

<!-- Write what your app does in 4-6 points -->

### 1.3 Key Features

- Role-based authentication (`rfqowner`, `bidder`)
- RFQ creation and auction lifecycle management
- Real-time bidding with WebSocket updates
- British-auction style extension logic
- Activity timeline, exports, metrics, and winner award

---

## 2) System Architecture Diagram

```mermaid
flowchart LR
    U[Users]
    B1[RFQ Owner]
    B2[Bidder]
    FE[Frontend<br/>React + Vite + MUI]
    API[Backend API<br/>FastAPI]
    WS[WebSocket Room Manager]
    SCH[Auction Scheduler]
    DB[(MongoDB)]
    AI[Gemini API<br/>Recommendations]

    U --> B1
    U --> B2
    B1 --> FE
    B2 --> FE
    FE -->|REST /api/*| API
    FE -->|WS /api/ws/rfqs/{id}| WS
    API --> DB
    SCH --> DB
    SCH --> WS
    API -->|optional| AI
```

---

## 3) Authentication Flow (Sequence Diagram)

```mermaid
sequenceDiagram
    participant User
    participant FE as Frontend
    participant API as FastAPI
    participant DB as MongoDB

    User->>FE: Enter company/email + password
    FE->>API: POST /api/auth/login
    API->>DB: Find user by username/email
    DB-->>API: User document
    API->>API: Verify password hash
    API->>API: Create JWT token
    API-->>FE: access_token + role + company_name
    FE->>FE: Store token in localStorage
    FE->>API: Subsequent requests with Bearer token
```

---

## 4) RFQ Lifecycle State Diagram

```mermaid
stateDiagram-v2
    [*] --> upcoming
    upcoming --> active: current_time >= bid_start_time
    active --> closed: current_time >= current_close_time
    active --> force_closed: current_time >= forced_close_time
    upcoming --> paused: rfqowner pauses (editable window)
    active --> paused: rfqowner pauses (if allowed)
    paused --> force_closed: current_time >= forced_close_time
    closed --> [*]
    force_closed --> [*]
```

---

## 5) Bid Submission and Ranking Flow

```mermaid
flowchart TD
    A[Bidder submits bid] --> B{RFQ exists and active?}
    B -- No --> X[Reject request]
    B -- Yes --> C{Within close windows?}
    C -- No --> X
    C -- Yes --> D[Validate pricing rules<br/>starting_price, minimum_decrement]
    D --> E[Insert or revise bidder's active bid]
    E --> F[Recalculate ranks by<br/>total_price asc, created_at asc]
    F --> G[Save immutable row in bid_revisions]
    G --> H[Apply extension trigger logic]
    H --> I[Broadcast bid_updated/time_extended via WebSocket]
    I --> J[Return updated bid response]
```

---

## 6) Auction Extension Decision Flow

```mermaid
flowchart TD
    A[Bid event occurs] --> B{Auction type supports British extension?}
    B -- No --> Z[No extension]
    B -- Yes --> C{Now in trigger window?<br/>current_close - trigger_window <= now <= current_close}
    C -- No --> Z
    C -- Yes --> D{Trigger condition met?<br/>bid_received / rank_change / l1_change}
    D -- No --> Z
    D -- Yes --> E[Compute new_close = current_close + extension_duration]
    E --> F[Cap at forced_close_time]
    F --> G{new_close > current_close?}
    G -- No --> Z
    G -- Yes --> H[Atomic update current_close_time]
    H --> I[Log activity: time_extended]
    I --> J[Broadcast WebSocket: time_extended]
```

---

## 7) Data Model (ER Diagram)

```mermaid
erDiagram
    USERS ||--o{ RFQS : creates
    RFQS ||--o{ BIDS : has
    RFQS ||--o{ BID_REVISIONS : tracks
    RFQS ||--o{ ACTIVITY_LOGS : logs
    USERS ||--o{ AUDIT_LOGS : generates

    USERS {
        ObjectId _id
        string username
        string email
        string password_hash
        string role
        datetime created_at
    }

    RFQS {
        ObjectId _id
        string name
        string created_by
        string reference_id
        datetime bid_start_time
        datetime bid_close_time
        datetime current_close_time
        datetime forced_close_time
        string status
        number starting_price
        number minimum_decrement
        datetime created_at
    }

    BIDS {
        ObjectId _id
        string rfq_id
        string carrier_name
        number total_price
        int rank
        datetime created_at
    }

    BID_REVISIONS {
        ObjectId _id
        string rfq_id
        string bid_id
        string carrier_name
        number total_price
        bool is_revision
        datetime created_at
    }

    ACTIVITY_LOGS {
        ObjectId _id
        string rfq_id
        string event_type
        string description
        datetime created_at
    }

    AUDIT_LOGS {
        ObjectId _id
        string action
        string username
        string role
        string resource_type
        datetime created_at
    }
```

---

## 8) Deployment Diagram

```mermaid
flowchart LR
    subgraph Client
        Browser[Web Browser]
    end

    subgraph App
        FE[Frontend<br/>Vite/React Static App]
        BE[FastAPI Service]
        SCH[Scheduler Loop]
    end

    subgraph Data
        MDB[(MongoDB)]
    end

    Browser --> FE
    FE -->|HTTPS REST| BE
    FE -->|WSS| BE
    BE --> MDB
    SCH --> MDB
```

---

## 9) API Surface

### 9.1 Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/settings`
- `PATCH /api/auth/settings`

### 9.2 RFQ and Auction

- `POST /api/rfqs`
- `GET /api/rfqs`
- `GET /api/rfqs/{rfq_id}`
- `PATCH /api/rfqs/{rfq_id}`
- `DELETE /api/rfqs/{rfq_id}`
- `POST /api/rfqs/{rfq_id}/pause`
- `POST /api/rfqs/{rfq_id}/award`
- `GET /api/bidder/my-auctions`

### 9.3 Bids and Activity

- `POST /api/rfqs/{rfq_id}/bids`
- `GET /api/rfqs/{rfq_id}/bids`
- `GET /api/rfqs/{rfq_id}/bids/export`
- `GET /api/rfqs/{rfq_id}/bid-revisions`
- `GET /api/rfqs/{rfq_id}/activity`
- `GET /api/rfqs/{rfq_id}/activity/export`

### 9.4 Metrics

- `GET /api/metrics/bids-per-rfq`
- `GET /api/metrics/avg-bids`
- `GET /api/metrics/winning-price-trend`
- `GET /api/metrics/extensions-per-rfq`
- `GET /api/metrics/extension-impact`
- `POST /api/dashboard/recommendations`

---

## 10) Business Rules

- `forced_close_time` must be greater than `bid_close_time`.
- Bidding allowed only while auction is active.
- One active bid row per bidder per RFQ (revisions update existing row).
- Rank is recalculated globally for RFQ after every submit/revision.
- Auto-extension applies only for British-compatible auction types.
- Extension never exceeds `forced_close_time`.
- Winner can be awarded only after `closed` or `force_closed`.

---

## 11) Security and Reliability

- JWT authentication + role-based authorization.
- Password hashing with PBKDF2-SHA256 (legacy bcrypt verification support).
- In-memory request rate limiting.
- Request ID propagation (`x-request-id`).
- HTTPS enforcement + HSTS in production.
- Scheduler runs periodic status sync and websocket status push.
- Audit logs for sensitive actions.

---

## 12) Testing Strategy

### 12.1 Backend

<!-- Mention pytest coverage: auth, auction logic, route hardening, websocket auth -->

### 12.2 Frontend

<!-- Mention page-level and auth flow tests -->

### 12.3 Manual Test Checklist

- Signup/login both roles
- Create RFQ with valid/invalid times
- Submit bids and verify rank updates
- Trigger extension near close time
- Verify pause/award/export flows

---

## 13) Future Enhancements

- Redis-based distributed rate limiter and WebSocket pub/sub.
- Notifications (email/WhatsApp/Slack) for close/award events.
- Rich attachment storage with signed URLs.
- Multi-tenant organization boundaries and fine-grained permissions.
- Advanced bidder analytics and recommendation explainability.

---

## 14) Appendix

### 14.1 Environment Variables

<!-- Copy final env keys used in backend/.env and frontend/.env -->

### 14.2 Demo Credentials

<!-- Add seed_demo and/or seed_full credentials -->

### 14.3 Links

<!-- Add deployed app URL, API docs URL, repo URL -->
