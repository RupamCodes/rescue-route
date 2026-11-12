from __future__ import annotations

import math
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import FoodListing, User


EARTH_RADIUS_KM = 6371.0
URGENCY_DECAY_CONSTANT = 0.0035
MAX_RESCUE_RADIUS_KM = 25.0
URGENCY_WEIGHT = 0.65
DISTANCE_WEIGHT = 0.35


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points on Earth (km)."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)

    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(lat1_r) * math.cos(lat2_r) * math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(EARTH_RADIUS_KM * c, 2)


def calculate_urgency_score(
    expiry_time: datetime,
    current_time: datetime | None = None
) -> float:
    """Compute urgency decay score based on remaining shelf-life."""
    if current_time is None:
        current_time = datetime.now(timezone.utc)

    if expiry_time.tzinfo is None:
        expiry_time = expiry_time.replace(tzinfo=timezone.utc)

    delta_minutes = (expiry_time - current_time).total_seconds() / 60.0

    if delta_minutes <= 0:
        return 0.0

    score = 100.0 * math.exp(-URGENCY_DECAY_CONSTANT * delta_minutes)
    return round(score, 2)


def calculate_match_score(
    urgency: float,
    distance_km: float,
    max_radius_km: float = MAX_RESCUE_RADIUS_KM
) -> float:
    """Compute composite match score from urgency and distance."""
    if distance_km > max_radius_km:
        return 0.0

    dist_factor = max(0.0, 1.0 - (distance_km / max_radius_km))
    score = (URGENCY_WEIGHT * urgency) + (DISTANCE_WEIGHT * dist_factor * 100)
    return round(score, 2)


def rank_shelters_for_listing(
    db: Session,
    listing_id: int,
    top_n: int = 3
) -> list[dict]:
    """Rank all shelters by composite match score for a listing."""
    listing = db.execute(
        select(FoodListing).where(FoodListing.id == listing_id)
    ).scalar_one_or_none()

    if listing is None:
        raise ValueError(f"FoodListing {listing_id} not found")

    shelters = db.execute(
        select(User).where(User.role == "SHELTER")
    ).scalars().all()

    results = []
    for shelter in shelters:
        distance = haversine_distance_km(
            listing.latitude, listing.longitude,
            shelter.latitude, shelter.longitude
        )
        urgency = calculate_urgency_score(listing.expiry_timestamp)
        composite = calculate_match_score(urgency, distance)

        results.append({
            "shelter_id": shelter.id,
            "shelter_name": shelter.name,
            "distance_km": distance,
            "urgency_score": urgency,
            "composite_score": composite,
        })

    results.sort(key=lambda x: x["composite_score"], reverse=True)
    return results[:top_n]