from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import FoodListing, FoodListingStatus
from backend.schemas import FoodListingCreate, FoodListingResponse
from backend.services.matcher import calculate_urgency_score, rank_shelters_for_listing

router = APIRouter(prefix="/api/listings", tags=["listings"])


@router.post(
    "",
    response_model=FoodListingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_listing(
    payload: FoodListingCreate,
    db: Session = Depends(get_db),
) -> FoodListingResponse:
    if payload.expiry_timestamp <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expiry_timestamp must be in the future",
        )

    listing = FoodListing(
        donor_id=payload.donor_id,
        title=payload.title,
        food_type=payload.food_type,
        quantity_kg=payload.quantity_kg,
        prepared_at=payload.prepared_at,
        expiry_timestamp=payload.expiry_timestamp,
        target_temp_celsius=payload.target_temp_celsius,
        dietary_notes=payload.dietary_notes,
        status=FoodListingStatus.PENDING.value,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@router.get("/active", response_model=list[dict])
def get_active_listings(db: Session = Depends(get_db)) -> list[dict]:
    now = datetime.now(timezone.utc)
    listings = db.execute(
        select(FoodListing).where(
            FoodListing.status.in_([FoodListingStatus.PENDING.value, FoodListingStatus.MATCHED.value]),
            FoodListing.expiry_timestamp > now,
        )
    ).scalars().all()

    result = []
    for l in listings:
        data = FoodListingResponse.model_validate(l).model_dump()
        data["urgency_score"] = calculate_urgency_score(l.expiry_timestamp)
        result.append(data)

    result.sort(key=lambda x: x["urgency_score"], reverse=True)
    return result


@router.get("/{listing_id}/matches", response_model=list[dict])
def get_listing_matches(
    listing_id: int,
    top_n: int = 3,
    db: Session = Depends(get_db),
) -> list[dict]:
    try:
        return rank_shelters_for_listing(db, listing_id, top_n)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/reset-demo", status_code=status.HTTP_200_OK)
def reset_demo_listings(db: Session = Depends(get_db)) -> dict:
    """Reset demo listings with fresh expiry timestamps relative to now."""
    now = datetime.now(timezone.utc)
    listings = db.execute(
        select(FoodListing).where(FoodListing.id.in_([1, 2, 3]))
    ).scalars().all()

    if len(listings) < 3:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo listings not found")

    # Reset expiry timestamps relative to now
    new_expiries = {
        1: now + timedelta(minutes=45),   # Steamed Basmati - Critical (45m)
        2: now + timedelta(minutes=180),  # Paneer Gravy - Urgent (180m)
        3: now + timedelta(minutes=480),  # Sourdough - Stable (480m)
    }

    for l in listings:
        l.expiry_timestamp = new_expiries.get(l.id, now + timedelta(minutes=60))
        l.status = FoodListingStatus.PENDING.value

    db.commit()
    return {"success": True, "message": "Demo listings refreshed"}