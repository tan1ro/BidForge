from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, StringConstraints, field_validator
from typing import Annotated


class ExtensionTriggerType(str, Enum):
    BID_RECEIVED = "bid_received"
    RANK_CHANGE = "rank_change"
    L1_CHANGE = "l1_change"


class AuctionStatus(str, Enum):
    UPCOMING = "upcoming"
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"
    FORCE_CLOSED = "force_closed"


# ─── RFQ Models ───

class RFQCreate(BaseModel):
    name: Annotated[str, StringConstraints(min_length=3, max_length=120, strip_whitespace=True)]
    material: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] = ""
    quantity: Annotated[str, StringConstraints(min_length=1, max_length=120, strip_whitespace=True)] = ""
    pickup_location: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] = ""
    delivery_location: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] = ""
    bid_start_time: datetime
    bid_close_time: datetime
    forced_close_time: datetime
    pickup_date: datetime
    trigger_window_minutes: int = Field(ge=1, le=60, default=10)
    extension_duration_minutes: int = Field(ge=1, le=30, default=5)
    extension_trigger: ExtensionTriggerType = ExtensionTriggerType.BID_RECEIVED
    auction_type: Annotated[str, StringConstraints(min_length=2, max_length=40, strip_whitespace=True)] = "Reverse Auction (lowest wins)"
    starting_price: float = Field(ge=0, default=0)
    minimum_decrement: float = Field(ge=0, default=0)
    technical_specs_attachment: Annotated[str, StringConstraints(max_length=500, strip_whitespace=True)] = ""
    technical_specs_url: Annotated[str, StringConstraints(max_length=1000, strip_whitespace=True)] = ""
    technical_specs_file_name: Annotated[str, StringConstraints(max_length=255, strip_whitespace=True)] = ""
    technical_specs_content_type: Annotated[str, StringConstraints(max_length=120, strip_whitespace=True)] = ""
    technical_specs_file_size_bytes: int = Field(ge=0, default=0)
    loading_unloading_notes: Annotated[str, StringConstraints(max_length=1000, strip_whitespace=True)] = ""
    supplier_visibility_mode: Annotated[str, StringConstraints(min_length=4, max_length=40, strip_whitespace=True)] = "full_rank"


class RFQUpdate(BaseModel):
    name: Annotated[str, StringConstraints(min_length=3, max_length=120, strip_whitespace=True)] | None = None
    material: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] | None = None
    quantity: Annotated[str, StringConstraints(min_length=1, max_length=120, strip_whitespace=True)] | None = None
    pickup_location: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] | None = None
    delivery_location: Annotated[str, StringConstraints(min_length=2, max_length=160, strip_whitespace=True)] | None = None
    bid_start_time: datetime | None = None
    bid_close_time: datetime | None = None
    forced_close_time: datetime | None = None
    pickup_date: datetime | None = None
    trigger_window_minutes: int | None = Field(default=None, ge=1, le=60)
    extension_duration_minutes: int | None = Field(default=None, ge=1, le=30)
    extension_trigger: ExtensionTriggerType | None = None
    auction_type: Annotated[str, StringConstraints(min_length=2, max_length=40, strip_whitespace=True)] | None = None
    starting_price: float | None = Field(default=None, ge=0)
    minimum_decrement: float | None = Field(default=None, ge=0)
    technical_specs_attachment: Annotated[str, StringConstraints(max_length=500, strip_whitespace=True)] | None = None
    technical_specs_url: Annotated[str, StringConstraints(max_length=1000, strip_whitespace=True)] | None = None
    technical_specs_file_name: Annotated[str, StringConstraints(max_length=255, strip_whitespace=True)] | None = None
    technical_specs_content_type: Annotated[str, StringConstraints(max_length=120, strip_whitespace=True)] | None = None
    technical_specs_file_size_bytes: int | None = Field(default=None, ge=0)
    loading_unloading_notes: Annotated[str, StringConstraints(max_length=1000, strip_whitespace=True)] | None = None
    supplier_visibility_mode: Annotated[str, StringConstraints(min_length=4, max_length=40, strip_whitespace=True)] | None = None


class RFQResponse(BaseModel):
    id: str
    name: str
    reference_id: str
    bid_start_time: datetime
    bid_close_time: datetime
    current_close_time: datetime
    forced_close_time: datetime
    pickup_date: datetime
    trigger_window_minutes: int
    extension_duration_minutes: int
    extension_trigger: ExtensionTriggerType
    material: str = ""
    quantity: str = ""
    pickup_location: str = ""
    delivery_location: str = ""
    auction_type: str = "Reverse Auction (lowest wins)"
    starting_price: float = 0
    minimum_decrement: float = 0
    technical_specs_attachment: str = ""
    technical_specs_url: str = ""
    technical_specs_file_name: str = ""
    technical_specs_content_type: str = ""
    technical_specs_file_size_bytes: int = 0
    loading_unloading_notes: str = ""
    supplier_visibility_mode: str = "full_rank"
    awarded_supplier: Optional[str] = None
    awarded_bid_id: Optional[str] = None
    awarded_at: Optional[datetime] = None
    award_note: Optional[str] = None
    status: AuctionStatus
    lowest_bid: Optional[float] = None
    total_bids: int = 0
    winner_carrier: Optional[str] = None
    winning_bid_total: Optional[float] = None
    server_time: datetime
    created_at: datetime


# ─── Bid Models ───

class BidCreate(BaseModel):
    carrier_name: Annotated[str, StringConstraints(min_length=0, max_length=80, strip_whitespace=True)] = ""
    freight_charges: float = Field(ge=0)
    origin_charges: float = Field(ge=0)
    destination_charges: float = Field(ge=0)
    transit_time: int = Field(ge=1)
    validity: Annotated[str, StringConstraints(min_length=2, max_length=30, strip_whitespace=True)]
    vehicle_type: Annotated[str, StringConstraints(max_length=60, strip_whitespace=True)] = ""
    capacity_tons: float = Field(ge=0, default=0)
    insurance_included: bool = False


class BidResponse(BaseModel):
    id: str
    rfq_id: str
    carrier_name: str
    freight_charges: float
    origin_charges: float
    destination_charges: float
    total_price: float
    transit_time: int
    validity: str
    vehicle_type: str = ""
    capacity_tons: float = 0
    insurance_included: bool = False
    rank: int
    created_at: datetime


# ─── Activity Log Models ───

class ActivityLogResponse(BaseModel):
    id: str
    rfq_id: str
    event_type: str
    description: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class AwardRequest(BaseModel):
    bid_id: str
    award_note: Annotated[str, StringConstraints(max_length=500, strip_whitespace=True)] = ""


# ─── Auth Models ───

class UserSignup(BaseModel):
    company_name: Annotated[str, StringConstraints(min_length=3, max_length=40, strip_whitespace=True)]
    email: Annotated[str, StringConstraints(min_length=5, max_length=120, strip_whitespace=True)]
    password: Annotated[str, StringConstraints(min_length=6, max_length=128)]
    role: str = "supplier"

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value):
        if value is None:
            return "supplier"
        if not isinstance(value, str):
            raise ValueError("Role must be a string")
        normalized = value.strip().lower()
        if normalized not in {"buyer", "supplier"}:
            raise ValueError("Role must be either buyer or supplier")
        return normalized
