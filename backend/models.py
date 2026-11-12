from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import ForeignKey, String, Float, Boolean, DateTime, Integer
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from backend.database import Base


class UserRole(str, Enum):
    DONOR = "DONOR"
    VOLUNTEER = "VOLUNTEER"
    SHELTER = "SHELTER"

class FoodType(str, Enum):
    PERISHABLE_COOKED = "PERISHABLE_COOKED"
    RAW_PRODUCE = "RAW_PRODUCE"
    BAKERY = "BAKERY"
    PACKAGED = "PACKAGED"


class FoodListingStatus(str, Enum):
    PENDING = "PENDING"
    MATCHED = "MATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    EXPIRED = "EXPIRED"


class MissionStatus(str, Enum):
    DISPATCHED = "DISPATCHED"
    PICKED_UP = "PICKED_UP"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(20))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    listings: Mapped[list["FoodListing"]] = relationship(
        back_populates="donor", cascade="all, delete-orphan"
    )
    missions: Mapped[list["RescueMission"]] = relationship(
        back_populates="volunteer",
        primaryjoin="User.id==foreign(RescueMission.volunteer_id)",
        cascade="all, delete-orphan",
    )
    shelters: Mapped[list["RescueMission"]] = relationship(
        back_populates="shelter",
        primaryjoin="User.id==foreign(RescueMission.shelter_id)",
        cascade="all, delete-orphan",
    )


class FoodListing(Base):
    __tablename__ = "food_listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    donor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(160))
    food_type: Mapped[str] = mapped_column(String(32))
    quantity_kg: Mapped[float] = mapped_column(Float)
    prepared_at: Mapped[datetime] = mapped_column(DateTime)
    expiry_timestamp: Mapped[datetime] = mapped_column(DateTime)
    target_temp_celsius: Mapped[float] = mapped_column(Float)
    dietary_notes: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(20), default=FoodListingStatus.PENDING.value
    )
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)

    donor: Mapped["User"] = relationship(back_populates="listings")
    missions: Mapped[list["RescueMission"]] = relationship(
        secondary="mission_items", back_populates="listings"
    )


class RescueMission(Base):
    __tablename__ = "rescue_missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    volunteer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    shelter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(
        String(20), default=MissionStatus.DISPATCHED.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    volunteer: Mapped[Optional["User"]] = relationship(
        back_populates="missions", foreign_keys="RescueMission.volunteer_id"
    )
    shelter: Mapped["User"] = relationship(
        back_populates="shelters", foreign_keys="RescueMission.shelter_id"
    )
    listings: Mapped[list["FoodListing"]] = relationship(
        secondary="mission_items", back_populates="missions"
    )
    verification: Mapped[Optional["HandshakeVerification"]] = relationship(
        back_populates="mission", uselist=False
    )


class MissionItem(Base):
    __tablename__ = "mission_items"

    mission_id: Mapped[int] = mapped_column(
        ForeignKey("rescue_missions.id"), primary_key=True
    )
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("food_listings.id"), primary_key=True
    )


class HandshakeVerification(Base):
    __tablename__ = "handshake_verifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(
        ForeignKey("rescue_missions.id"), unique=True
    )
    pickup_code_hash: Mapped[str] = mapped_column(String(128))
    dropoff_code_hash: Mapped[str] = mapped_column(String(128))
    measured_pickup_temp_celsius: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    is_pickup_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dropoff_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    mission: Mapped["RescueMission"] = relationship(back_populates="verification")