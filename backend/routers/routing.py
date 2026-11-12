from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import FoodListing, RescueMission, User
from backend.services.router import optimize_mission_route

router = APIRouter(prefix="/api/routes", tags=["routing"])


@router.post("/optimize-mission/{mission_id}", status_code=status.HTTP_200_OK)
def optimize_mission(
    mission_id: int,
    vehicle_capacity_kg: float = Query(default=50.0, gt=0),
    db: Session = Depends(get_db),
) -> dict:
    mission = db.get(RescueMission, mission_id)
    if not mission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission not found")

    # Determine volunteer start location
    if mission.volunteer_id:
        volunteer = db.get(User, mission.volunteer_id)
        if not volunteer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer not found")
        volunteer_loc = (volunteer.latitude, volunteer.longitude)
    else:
        # Fallback to first listing donor location if no volunteer assigned
        first_listing = db.execute(
            select(FoodListing).where(FoodListing.id.in_([l.id for l in mission.listings]))
        ).scalars().first()
        if not first_listing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mission has no listings")
        donor = db.get(User, first_listing.donor_id)
        volunteer_loc = (donor.latitude, donor.longitude) if donor else (0.0, 0.0)

    # Get listings for this mission
    listings = db.execute(
        select(FoodListing).where(FoodListing.id.in_([l.id for l in mission.listings]))
    ).scalars().all()

    if not listings:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mission has no listings")

    listing_data = [
        {
            "id": l.id,
            "lat": l.latitude,
            "lng": l.longitude,
            "quantity_kg": l.quantity_kg,
            "title": l.title,
        }
        for l in listings
    ]

    shelter = db.get(User, mission.shelter_id)
    if not shelter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelter not found")

    shelter_loc = (shelter.latitude, shelter.longitude)

    try:
        result = optimize_mission_route(
            volunteer_loc=volunteer_loc,
            listings=listing_data,
            shelter_loc=shelter_loc,
            vehicle_capacity_kg=vehicle_capacity_kg,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return result