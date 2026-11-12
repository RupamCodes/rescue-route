from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    FoodListing,
    FoodListingStatus,
    HandshakeVerification,
    MissionStatus,
    RescueMission,
)
from backend.services.verifier import validate_food_safety_temp, verify_token

router = APIRouter(prefix="/api/verify", tags=["verification"])


class PickupVerifyRequest(BaseModel):
    mission_id: int
    pickup_code: str
    measured_temp_celsius: float


class DropoffVerifyRequest(BaseModel):
    mission_id: int
    dropoff_code: str


class VerificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    success: bool
    mission_id: int
    status: str
    message: str


@router.post("/pickup", response_model=VerificationResponse, status_code=status.HTTP_200_OK)
def verify_pickup(payload: PickupVerifyRequest, db: Session = Depends(get_db)) -> VerificationResponse:
    mission = db.get(RescueMission, payload.mission_id)
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")

    if mission.status != MissionStatus.DISPATCHED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mission must be DISPATCHED, current: {mission.status}",
        )

    verification = mission.verification
    if not verification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handshake not found")

    if not verify_token(payload.pickup_code, verification.pickup_code_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pickup code")

    food_types = [l.food_type for l in mission.listings]
    valid, msg = validate_food_safety_temp(food_types, payload.measured_temp_celsius)
    if not valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    verification.is_pickup_verified = True
    verification.measured_pickup_temp_celsius = payload.measured_temp_celsius
    mission.status = MissionStatus.PICKED_UP.value

    for l in mission.listings:
        l.status = FoodListingStatus.IN_TRANSIT.value

    db.commit()
    return VerificationResponse(
        success=True, mission_id=mission.id, status=mission.status, message="Pickup verified"
    )


@router.post("/dropoff", response_model=VerificationResponse, status_code=status.HTTP_200_OK)
def verify_dropoff(payload: DropoffVerifyRequest, db: Session = Depends(get_db)) -> VerificationResponse:
    mission = db.get(RescueMission, payload.mission_id)
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")

    verification = mission.verification
    if not verification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handshake not found")

    if not verification.is_pickup_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pickup not verified yet")

    if mission.status != MissionStatus.PICKED_UP.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mission must be PICKED_UP, current: {mission.status}",
        )

    if not verify_token(payload.dropoff_code, verification.dropoff_code_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid dropoff code")

    verification.is_dropoff_verified = True
    mission.status = MissionStatus.COMPLETED.value
    mission.completed_at = datetime.now(timezone.utc)

    for l in mission.listings:
        l.status = FoodListingStatus.DELIVERED.value

    db.commit()
    return VerificationResponse(
        success=True, mission_id=mission.id, status=mission.status, message="Dropoff verified"
    )