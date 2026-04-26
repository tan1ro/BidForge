# BidForge Schema Design

## 1) Overview

BidForge uses MongoDB with five primary collections:

- `users`
- `rfqs`
- `bids`
- `activity_logs`
- `audit_logs`

The schema supports British Auction workflows, real-time rank updates, extension tracking, and auditability.

## 2) Collection: `users`

Purpose: authentication and authorization (buyer/supplier).

### Fields

- `_id` (ObjectId, PK)
- `username` (string, unique, required)
- `email` (string, unique, required)
- `password_hash` (string, required)
- `role` (enum: `buyer` | `supplier`, required)
- `created_at` (datetime, required)

### Indexes

- unique index on `username`
- unique index on `email`

## 3) Collection: `rfqs`

Purpose: RFQ master record plus auction configuration and runtime state.

### Fields

- `_id` (ObjectId, PK)
- `name` (string, required)
- `reference_id` (string, generated, business identifier)
- `material` (string)
- `quantity` (string)
- `pickup_location` (string)
- `delivery_location` (string)
- `bid_start_time` (datetime, required)
- `bid_close_time` (datetime, required)
- `current_close_time` (datetime, required, mutable with extensions)
- `forced_close_time` (datetime, required)
- `pickup_date` (datetime, required)
- `trigger_window_minutes` (int, required, 1..60)
- `extension_duration_minutes` (int, required, 1..30)
- `extension_trigger` (enum: `bid_received` | `rank_change` | `l1_change`)
- `auction_type` (string; current default: reverse auction lowest wins)
- `starting_price` (number, required)
- `minimum_decrement` (number, required)
- `technical_specs_attachment` (string)
- `technical_specs_file_name` (string)
- `technical_specs_content_type` (string)
- `technical_specs_file_base64` (string, optional large payload)
- `loading_unloading_notes` (string)
- `is_paused` (bool)
- `status` (enum: `upcoming` | `active` | `paused` | `closed` | `force_closed`)
- `created_at` (datetime, required)

### Validation Rules (Business)

- `bid_start_time < bid_close_time`
- `forced_close_time > bid_close_time`
- extension updates must satisfy: `current_close_time <= forced_close_time`
- `starting_price > 0`
- `minimum_decrement >= 0`
- `minimum_decrement < starting_price`

### Indexes

- index on `(created_at desc)`
- index on `(status, created_at desc)`
- index on `(status, current_close_time)`
- index on `(forced_close_time)`

## 4) Collection: `bids`

Purpose: supplier quote submissions per RFQ; one active row per supplier per RFQ.

### Fields

- `_id` (ObjectId, PK)
- `rfq_id` (string, required, FK-like reference to `rfqs._id`)
- `carrier_name` (string, required; canonical supplier username)
- `carrier_display_name` (string; human-readable supplier/carrier label)
- `freight_charges` (number, required)
- `origin_charges` (number, required)
- `destination_charges` (number, required)
- `total_price` (number, required, derived)
- `transit_time` (int, required)
- `validity` (string, required)
- `vehicle_type` (string)
- `capacity_tons` (number)
- `insurance_included` (bool)
- `rank` (int, required, recalculated)
- `created_at` (datetime, required; updated for revisions)

### Constraints / Rules

- non-negative charge components
- `total_price = freight + origin + destination`
- `total_price > 0`
- first bid may be constrained by `starting_price`
- subsequent bids may require decrement against current L1
- at most one bid row per (`rfq_id`, `carrier_name`) via unique index

### Indexes

- index on `rfq_id`
- compound index on `(rfq_id, total_price)`
- unique compound index on `(rfq_id, carrier_name)`

## 5) Collection: `activity_logs`

Purpose: transparent auction timeline for business events and reasoning.

### Fields

- `_id` (ObjectId, PK)
- `rfq_id` (string, required)
- `event_type` (string, required)
- `description` (string, required)
- `metadata` (object/dict, optional)
- `created_at` (datetime, required)

### Typical Event Types

- `rfq_created`
- `rfq_updated`
- `bid_submitted`
- `time_extended`
- `auction_started`
- `auction_closed`
- `auction_paused`

### Indexes

- compound index on `(rfq_id, created_at desc)`

## 6) Collection: `audit_logs`

Purpose: security and operational trace of sensitive user actions.

### Fields (representative)

- `_id` (ObjectId, PK)
- `action` (string, required)
- `username` (string, required)
- `role` (string, required)
- `resource_type` (string)
- `resource_id` (string)
- `metadata` (object)
- `request_id` (string)
- `created_at` (datetime, required)

### Indexes

- index on `(created_at desc)`
- index on `(action, created_at desc)`

## 7) Logical Relationships

- One `user` (buyer) can create many `rfqs`.
- One `rfq` can have many `bids`.
- One supplier has at most one current bid row per RFQ (updated on revision).
- One `rfq` can have many `activity_logs`.
- Any user action can generate many `audit_logs`.

Note: MongoDB does not enforce foreign keys natively; referential integrity is maintained in application logic.

## 8) Suggested ER View (Text)

- `users (1) -> (N) rfqs` by creator context in app flow
- `rfqs (1) -> (N) bids` via `bids.rfq_id`
- `rfqs (1) -> (N) activity_logs` via `activity_logs.rfq_id`
- `users (1) -> (N) audit_logs` via `audit_logs.username`

## 9) Data Lifecycle Notes

- RFQ delete operation cascades in application layer:
  - delete all `bids` for that RFQ
  - delete all `activity_logs` for that RFQ
  - delete RFQ record
- closed/force-closed RFQs retain bid and timeline data for reporting and traceability.
