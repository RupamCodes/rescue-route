from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    FoodListing, FoodListingStatus, HandshakeVerification, MissionStatus,
    RescueMission, User,
)

router = APIRouter(prefix="/api/missions", tags=["missions"])


class DispatchRequest(BaseModel):
    listing_ids: list[int]
    shelter_id: int
    volunteer_id: int | None = None


class DispatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    mission_id: int
    listing_ids: list[int]
    shelter_id: int
    volunteer_id: int | None
    status: str
    created_at: datetime
    pickup_code: str
    dropoff_code: str


class MissionDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    created_at: datetime
    completed_at: datetime | None
    volunteer_id: int | None
    shelter_id: int
    listings: list[int]
    verification: dict | None


@router.post("/dispatch", response_model=DispatchResponse, status_code=status.HTTP_201_CREATED)
def dispatch_mission(payload: DispatchRequest, db: Session = Depends(get_db)) -> DispatchResponse:
    if not payload.listing_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one listing_id required")

    listings = db.execute(select(FoodListing).where(FoodListing.id.in_(payload.listing_ids))).scalars().all()
    if len(listings) != len(payload.listing_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more listings not found")

    for l in listings:
        if l.status != FoodListingStatus.PENDING.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Listing {l.id} is not PENDING")

    shelter = db.get(User, payload.shelter_id)
    if not shelter or shelter.role != "SHELTER":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelter not found")

    if payload.volunteer_id:
        volunteer = db.get(User, payload.volunteer_id)
        if not volunteer or volunteer.role != "VOLUNTEER":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer not found")

    pickup, dropoff = secrets.token_hex(3).upper(), secrets.token_hex(3).upper()

    mission = RescueMission(volunteer_id=payload.volunteer_id, shelter_id=payload.shelter_id,
                           status=MissionStatus.DISPATCHED.value, created_at=datetime.now(timezone.utc))
    db.add(mission)
    db.flush()

    for l in listings:
        l.status = FoodListingStatus.MATCHED.value
        mission.listings.append(l)

    db.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash=pickup, dropoff_code_hash=dropoff,
                                 is_pickup_verified=False, is_dropoff_verified=False))
    db.commit()

    return DispatchResponse(mission_id=mission.id, listing_ids=payload.listing_ids,
                           shelter_id=payload.shelter_id, volunteer_id=payload.volunteer_id,
                           status=mission.status, created_at=mission.created_at, pickup_code=pickup, dropoff_code=dropoff)


@router.get("/{mission_id}", response_model=MissionDetailResponse)
def get_mission(mission_id: int, db: Session = Depends(get_db)) -> MissionDetailResponse:
    mission = db.get(RescueMission, mission_id)
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")

    ver = None
    if mission.verification:
        ver = {"pickup_verified": mission.verification.is_pickup_verified,
               "dropoff_verified": mission.verification.is_dropoff_verified}

    return MissionDetailResponse(id=mission.id, status=mission.status, created_at=mission.created_at,
                                 completed_at=mission.completed_at, volunteer_id=mission.volunteer_id,
                                 shelter_id=mission.shelter_id, listings=[l.id for l in mission.listings],
                                 verification=ver)