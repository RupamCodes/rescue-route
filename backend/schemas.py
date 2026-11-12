from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    role: str = Field(pattern=r"^(DONOR|VOLUNTEER|SHELTER)$")
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=255)
    phone: str = Field(max_length=20)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    name: str
    email: str
    phone: str
    latitude: float
    longitude: float
    created_at: datetime


class FoodListingCreate(BaseModel):
    donor_id: int
    title: str = Field(min_length=1, max_length=160)
    food_type: str = Field(
        pattern=r"^(PERISHABLE_COOKED|RAW_PRODUCE|BAKERY|PACKAGED)$"
    )
    quantity_kg: float = Field(gt=0.0)
    prepared_at: datetime
    expiry_timestamp: datetime
    target_temp_celsius: float
    dietary_notes: str = Field(max_length=255)
    status: str = Field(default="PENDING")
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


class FoodListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    donor_id: int
    title: str
    food_type: str
    quantity_kg: float
    prepared_at: datetime
    expiry_timestamp: datetime
    target_temp_celsius: float
    dietary_notes: str
    status: str
    latitude: float
    longitude: float


class MissionCreate(BaseModel):
    volunteer_id: int | None = None
    shelter_id: int
    status: str = Field(default="DISPATCHED")
    listing_ids: list[int] = Field(default_factory=list)


class MissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    volunteer_id: int | None
    shelter_id: int
    status: str
    created_at: datetime
    completed_at: datetime | None