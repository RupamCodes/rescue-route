from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.database import Base, get_db
from backend.main import app
from backend.models import (
    FoodListing,
    FoodListingStatus,
    MissionStatus,
    RescueMission,
    User,
    UserRole,
)
from backend.services.router import optimize_mission_route


import tempfile
import os

@pytest.fixture
def test_engine():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()
    os.unlink(path)


@pytest.fixture
def db_session(test_engine) -> Session:
    with Session(test_engine) as session:
        yield session


@pytest.fixture
def client(db_session: Session) -> TestClient:
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def create_test_users(db: Session) -> dict[str, int]:
    donor = User(role=UserRole.DONOR.value, name="Donor", email="d@test.com", phone="1", latitude=40.7128, longitude=-74.0060)
    shelter = User(role=UserRole.SHELTER.value, name="Shelter", email="s@test.com", phone="2", latitude=40.7130, longitude=-74.0062)
    volunteer = User(role=UserRole.VOLUNTEER.value, name="Volunteer", email="v@test.com", phone="3", latitude=40.7140, longitude=-74.0070)
    db.add_all([donor, shelter, volunteer])
    db.commit()
    return {"donor": donor.id, "shelter": shelter.id, "volunteer": volunteer.id}


class TestOptimizeMissionRoute:
    def test_basic_route_structure(self, db_session: Session) -> None:
        listings = [
            {"id": 1, "lat": 40.7128, "lng": -74.0060, "quantity_kg": 10.0, "title": "Listing 1"},
            {"id": 2, "lat": 40.7130, "lng": -74.0062, "quantity_kg": 15.0, "title": "Listing 2"},
        ]
        result = optimize_mission_route(
            volunteer_loc=(40.7140, -74.0070),
            listings=listings,
            shelter_loc=(40.7130, -74.0062),
        )

        assert "waypoints" in result
        assert "total_distance_km" in result
        assert "estimated_duration_minutes" in result

        wps = result["waypoints"]
        assert wps[0]["type"] == "START"
        assert wps[-1]["type"] == "DROPOFF"
        assert len([w for w in wps if w["type"] == "PICKUP"]) == 2

        visited_ids = {w["listing_id"] for w in wps if w["listing_id"] is not None}
        assert visited_ids == {1, 2}

    def test_exceeds_capacity_raises(self) -> None:
        listings = [
            {"id": 1, "lat": 40.7128, "lng": -74.0060, "quantity_kg": 60.0, "title": "Heavy"},
        ]
        with pytest.raises(ValueError, match="Total load exceeds vehicle capacity"):
            optimize_mission_route(
                volunteer_loc=(40.7140, -74.0070),
                listings=listings,
                shelter_loc=(40.7130, -74.0062),
                vehicle_capacity_kg=50.0,
            )

    def test_empty_listings_raises(self) -> None:
        with pytest.raises(ValueError, match="At least one listing required"):
            optimize_mission_route(
                volunteer_loc=(40.7140, -74.0070),
                listings=[],
                shelter_loc=(40.7130, -74.0062),
            )

    def test_distance_positive(self) -> None:
        listings = [{"id": 1, "lat": 40.7128, "lng": -74.0060, "quantity_kg": 10.0, "title": "L1"}]
        result = optimize_mission_route(
            volunteer_loc=(40.7140, -74.0070),
            listings=listings,
            shelter_loc=(40.7130, -74.0062),
        )
        assert result["total_distance_km"] > 0
        assert result["estimated_duration_minutes"] > 0


class TestRoutingAPI:
    def test_optimize_mission_endpoint(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)

        listing = FoodListing(
            donor_id=users["donor"],
            title="Test Meal",
            food_type="PERISHABLE_COOKED",
            quantity_kg=12.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(
            volunteer_id=users["volunteer"],
            shelter_id=users["shelter"],
            status=MissionStatus.DISPATCHED.value,
        )
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.commit()

        resp = client.post(f"/api/routes/optimize-mission/{mission.id}?vehicle_capacity_kg=50")
        assert resp.status_code == 200
        data = resp.json()
        assert "waypoints" in data
        assert "total_distance_km" in data
        assert "estimated_duration_minutes" in data
        assert len(data["waypoints"]) >= 3

    def test_optimize_mission_not_found(self, client: TestClient) -> None:
        resp = client.post("/api/routes/optimize-mission/999?vehicle_capacity_kg=50")
        assert resp.status_code == 404

    def test_optimize_mission_exceeds_capacity(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)

        listing = FoodListing(
            donor_id=users["donor"],
            title="Heavy Load",
            food_type="PERISHABLE_COOKED",
            quantity_kg=60.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(
            volunteer_id=users["volunteer"],
            shelter_id=users["shelter"],
            status=MissionStatus.DISPATCHED.value,
        )
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.commit()

        resp = client.post(f"/api/routes/optimize-mission/{mission.id}?vehicle_capacity_kg=50")
        assert resp.status_code == 400
        assert "exceeds vehicle capacity" in resp.json()["detail"].lower()