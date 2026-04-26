# BidForge Schema Design

## 1) Overview

BidForge uses MongoDB with the following primary collections:

- `users`
- `rfqs`
- `bids`
- `activity_logs`
- `bid_revisions`
- `audit_logs`
- `distributed_locks`

The schema supports:

- Role-based authentication and profile settings.
- Auction setup and runtime status tracking.
- Bid ranking and bid revision history.
- Auction timeline transparency.
- Metrics aggregation workloads.
- Scheduler coordination in multi-instance environments.

## 2) Collection: `users`

Purpose: identity, authentication, role authorization, and user preferences.

### Core fields

- `_id`: ObjectId (primary key)
- `username`: string (company/account name; unique)
- `email`: string (unique)
- `password_hash`: string (PBKDF2 format; legacy bcrypt values may exist)
- `role`: enum string (`rfqowner` | `bidder`)
- `settings`: object
  - `email_notifications`: bool
  - `timezone`: string (IANA timezone)
  - `default_rfq_page_size`: int
  - `use_24h_time`: bool
  - `date_format`: enum (`short` | `medium` | `long`)
  - `auto_refresh_seconds`: int
- `created_at`: datetime (UTC)

### Indexes

- unique index: `username`
- unique index: `email`

### Notes

- Login supports either `username` or `email`.
- Role values are normalized to lowercase in auth logic.

## 3) Collection: `rfqs`

Purpose: RFQ master record with auction configuration, runtime state, and award metadata.

### Core fields

- `_id`: ObjectId (primary key)
- `name`: string
- `created_by`: string (`rfqowner` username)
- `reference_id`: string (business-facing RFQ code)
- `material`: string
- `quantity`: string
- `pickup_location`: string
- `delivery_location`: string

### Time and status fields

- `bid_start_time`: datetime (UTC)
- `bid_close_time`: datetime (scheduled close)
- `current_close_time`: datetime (mutable close after extensions)
- `forced_close_time`: datetime (hard stop)
- `pickup_date`: datetime
- `status`: enum string (`upcoming` | `active` | `paused` | `closed` | `force_closed`)
- `is_paused`: bool
- `created_at`: datetime (UTC)

### Auction behavior fields

- `trigger_window_minutes`: int (1..60)
- `extension_duration_minutes`: int (1..30)
- `extension_trigger`: enum string (`bid_received` | `rank_change` | `l1_change`)
- `auction_type`: string (e.g. `Reverse Auction (lowest wins)`, `Sealed Bid`)
- `bidder_visibility_mode`: enum-like string (`full_rank` | `masked_competitor`)

### Pricing controls

- `starting_price`: number (> 0 in RFQ create/update validation)
- `minimum_decrement`: number (>= 0 and < `starting_price`)

### Technical specification metadata

- `technical_specs_attachment`: string
- `technical_specs_url`: string
- `technical_specs_file_name`: string
- `technical_specs_content_type`: string
- `technical_specs_file_size_bytes`: int
- `loading_unloading_notes`: string

### Award metadata

- `awarded_bidder`: string | null
- `awarded_bid_id`: string | null
- `awarded_at`: datetime | null
- `award_note`: string | null

### Indexes

- index: `{ created_at: -1 }`
- index: `{ status: 1, created_at: -1 }`
- index: `{ status: 1, current_close_time: 1 }`
- index: `{ forced_close_time: 1 }`
- index: `{ name: 1 }`

### Validation/consistency rules in application logic

- `bid_start_time < bid_close_time`
- `forced_close_time > bid_close_time`
- `pickup_date > bid_start_time`
- `current_close_time <= forced_close_time` (during extension flow)
- `extension_duration_minutes <= (forced_close_time - bid_close_time in minutes)`
- status transitions are clock-driven with scheduler support

## 4) Collection: `bids`

Purpose: active (latest) bid per bidder per RFQ.

### Core fields

- `_id`: ObjectId
- `rfq_id`: string (stores string form of RFQ ObjectId)
- `carrier_name`: string (canonical bidder username)
- `carrier_display_name`: string (user-facing label)
- `freight_charges`: number
- `origin_charges`: number
- `destination_charges`: number
- `total_price`: number (`freight + origin + destination`)
- `transit_time`: int
- `validity`: string
- `vehicle_type`: string
- `capacity_tons`: number
- `insurance_included`: bool
- `rank`: int (recalculated after each submit/revision)
- `created_at`: datetime (timestamp of latest submission/revision)

### Indexes

- index: `{ rfq_id: 1 }`
- index: `{ rfq_id: 1, total_price: 1 }`
- unique index: `{ rfq_id: 1, carrier_name: 1 }`

### Constraints enforced in service layer

- Charges cannot be negative.
- `total_price > 0`.
- First bid must not exceed `starting_price` (if configured).
- New/revised bids must beat current L1 by at least `minimum_decrement` (if configured and L1 exists).

## 5) Collection: `bid_revisions`

Purpose: immutable history of bid submissions/revisions for traceability.

### Fields

- `_id`: ObjectId
- `rfq_id`: string
- `bid_id`: string (current bid document id)
- `carrier_name`: string
- `total_price`: number
- `is_revision`: bool
- `previous_total`: number | null
- `created_at`: datetime (UTC)

### Indexes

- index: `{ rfq_id: 1, created_at: -1 }`
- index: `{ rfq_id: 1, carrier_name: 1, created_at: -1 }`

### Notes

- `bids` stores only current state.
- `bid_revisions` provides append-only historical changes.

## 6) Collection: `activity_logs`

Purpose: RFQ timeline for business-level events and explanations.

### Fields

- `_id`: ObjectId
- `rfq_id`: string
- `event_type`: string
- `description`: string
- `metadata`: object (optional)
- `created_at`: datetime (UTC)

### Typical event types

- `rfq_created`
- `rfq_updated`
- `bid_submitted`
- `time_extended`
- `auction_started`
- `auction_closed`
- `auction_paused`
- `award_winner`

### Indexes

- index: `{ rfq_id: 1, created_at: -1 }`
- index: `{ rfq_id: 1, event_type: 1, created_at: -1 }`
- index: `{ event_type: 1 }`

## 7) Collection: `audit_logs`

Purpose: security and operational observability trail.

### Fields

- `_id`: ObjectId
- `action`: string
- `username`: string
- `role`: string
- `resource_type`: string
- `resource_id`: string | null
- `metadata`: object
- `created_at`: datetime (UTC)

### Indexes

- index: `{ created_at: -1 }`
- index: `{ action: 1, created_at: -1 }`

### Notes

- `request_id` is recorded inside `metadata` when available.
- Used for auth, RFQ, bid, metrics, exports, and settings actions.

## 8) Collection: `distributed_locks`

Purpose: lightweight lock document for scheduler leader election / lock renewal.

### Fields (implementation-dependent but typical)

- `_id`: ObjectId
- lock owner metadata
- `expires_at`: datetime

### Indexes

- index: `{ expires_at: 1 }`

### Notes

- Helps prevent duplicate scheduler work in multi-instance deployments.

## 9) Relationships and Cardinality

- `users (rfqowner) 1 -> N rfqs` via `rfqs.created_by`.
- `rfqs 1 -> N bids` via `bids.rfq_id`.
- `rfqs 1 -> N bid_revisions` via `bid_revisions.rfq_id`.
- `rfqs 1 -> N activity_logs` via `activity_logs.rfq_id`.
- `users 1 -> N audit_logs` via `audit_logs.username`.

MongoDB does not enforce foreign keys; integrity is maintained by service logic.

## 10) Lifecycle and Retention Behavior

- RFQ delete currently cascades in application layer to:
  - `bids` for that RFQ
  - `activity_logs` for that RFQ
  - RFQ document itself
- `bid_revisions` cleanup on RFQ delete is not currently part of delete route; historical rows may remain unless separately cleaned.
- Closed/force-closed RFQs retain data for analytics and traceability.

## 11) Query/Analytics Design Considerations

- Metrics are powered via aggregation pipelines on RFQ and activity collections.
- String `rfq_id` linkage is used for joins (`$lookup` with `$toString` where needed).
- Status is both persisted and recomputed live; consumers should account for real-time computation in read APIs.
