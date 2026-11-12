from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import isclose

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.database import Base
from backend.models import FoodListing, User
from backend.services.matcher import (
    calculate_match_score,
    calculate_urgency_score,
    haversine_distance_km,
    rank_shelters_for_listing,
)


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class TestHaversine:
    def test_same_coordinates(self) -> None:
        dist = haversine_distance_km(40.7128, -74.0060, 40.7128, -74.0060)
        assert dist == 0.0

    def test_known_distance(self) -> None:
        # NYC to Philadelphia ~130 km
        dist = haversine_distance_km(40.7128, -74.0060, 39.9526, -75.1652)
        assert 125 < dist < 135


class TestUrgencyScore:
    def test_expired_returns_zero(self) -> None:
        past = datetime.now(timezone.utc) - timedelta(minutes=10)
        assert calculate_urgency_score(past) == 0.0

    def test_critical_window_above_80(self) -> None:
        future = datetime.now(timezone.utc) + timedelta(minutes=30)
        score = calculate_urgency_score(future)
        assert score > 80

    def test_fresh_food_below_15(self) -> None:
        future = datetime.now(timezone.utc) + timedelta(hours=12)
        score = calculate_urgency_score(future)
        assert score < 15

    def test_monotonic_decrease(self) -> None:
        now = datetime.now(timezone.utc)
        t1 = now + timedelta(minutes=15)
        t2 = now + timedelta(minutes=30)
        t3 = now + timedelta(minutes=60)

        s1 = calculate_urgency_score(t1)
        s2 = calculate_urgency_score(t2)
        s3 = calculate_urgency_score(t3)

        assert s1 > s2 > s3


class TestCompositeScore:
    def test_out_of_radius_returns_zero(self) -> None:
        assert calculate_match_score(90.0, 30.0, max_radius_km=25.0) == 0.0

    def test_at_origin_distance(self) -> None:
        # distance=0, urgency=100 -> score = 65 + 35 = 100
        score = calculate_match_score(100.0, 0.0)
        assert isclose(score, 100.0, abs_tol=0.01)


class TestRankShelters:
    def test_returns_sorted_shelters(self, db_session: Session) -> None:
        # Create listing
        listing = FoodListing(
            donor_id=1,
            title="Test Meals",
            food_type="PERISHABLE_COOKED",
            quantity_kg=10.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(minutes=30),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)

        # Create shelters at varying distances
        s1 = User(
            role="SHELTER", name="Near Shelter", email="near@test.com",
            phone="555-1111", latitude=40.7130, longitude=-74.0062
        )
        s2 = User(
            role="SHELTER", name="Far Shelter", email="far@test.com",
            phone="555-2222", latitude=39.9526, longitude=-75.1652
        )
        s3 = User(
            role="SHELTER", name="Mid Shelter", email="mid@test.com",
            phone="555-3333", latitude=40.7580, longitude=-73.9855
        )
        db_session.add_all([s1, s2, s3])
        db_session.commit()

        ranked = rank_shelters_for_listing(db_session, listing.id, top_n=3)

        assert len(ranked) == 3
        assert ranked[0]["composite_score"] >= ranked[1]["composite_score"]
        assert ranked[1]["composite_score"] >= ranked[2]["composite_score"]

    def test_raises_on_missing_listing(self, db_session: Session) -> None:
        with pytest.raises(ValueError):
            rank_shelters_for_listing(db_session, 999)