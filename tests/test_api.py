from __future__ import annotations

import tempfile
import os
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
    User,
    UserRole,
)


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
def base_user_ids(db_session: Session) -> dict[str, int]:
    """Create base users per test and return their IDs."""
    donor = User(
        role=UserRole.DONOR.value,
        name="Test Donor",
        email="donor@test.com",
        phone="555-0001",
        latitude=40.7128,
        longitude=-74.0060,
    )
    shelter = User(
        role=UserRole.SHELTER.value,
        name="Test Shelter",
        email="shelter@test.com",
        phone="555-0002",
        latitude=40.7130,
        longitude=-74.0062,
    )
    volunteer = User(
        role=UserRole.VOLUNTEER.value,
        name="Test Volunteer",
        email="volunteer@test.com",
        phone="555-0003",
        latitude=40.7140,
        longitude=-74.0070,
    )
    db_session.add_all([donor, shelter, volunteer])
    db_session.commit()
    return {"donor": donor.id, "shelter": shelter.id, "volunteer": volunteer.id}


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




class TestListings:
    def test_create_listing_valid(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        payload = {
            "donor_id": donor_id,
            "title": "Fresh Meals",
            "food_type": "PERISHABLE_COOKED",
            "quantity_kg": 10.0,
            "prepared_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            "expiry_timestamp": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            "target_temp_celsius": 4.0,
            "dietary_notes": "Vegetarian",
            "latitude": 40.7128,
            "longitude": -74.0060,
        }
        resp = client.post("/api/listings", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "PENDING"
        assert data["title"] == "Fresh Meals"

    def test_create_listing_expired_rejected(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        payload = {
            "donor_id": donor_id,
            "title": "Expired Meals",
            "food_type": "PERISHABLE_COOKED",
            "quantity_kg": 10.0,
            "prepared_at": (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(),
            "expiry_timestamp": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(),
            "target_temp_celsius": 4.0,
            "dietary_notes": "Vegetarian",
            "latitude": 40.7128,
            "longitude": -74.0060,
        }
        resp = client.post("/api/listings", json=payload)
        assert resp.status_code == 400

    def test_get_active_listings(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        listing1 = FoodListing(
            donor_id=donor_id,
            title="Active Listing",
            food_type="PERISHABLE_COOKED",
            quantity_kg=5.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=2),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        listing2 = FoodListing(
            donor_id=donor_id,
            title="Expired Listing",
            food_type="BAKERY",
            quantity_kg=3.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=5),
            expiry_timestamp=datetime.now(timezone.utc) - timedelta(minutes=30),
            target_temp_celsius=20.0,
            dietary_notes="Contains gluten",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add_all([listing1, listing2])
        db_session.commit()

        resp = client.get("/api/listings/active")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "Active Listing"
        assert "urgency_score" in data[0]

    def test_get_listing_matches(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        listing = FoodListing(
            donor_id=donor_id,
            title="Match Test",
            food_type="PERISHABLE_COOKED",
            quantity_kg=8.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(minutes=30),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        resp = client.get(f"/api/listings/{listing.id}/matches")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["shelter_id"] == base_user_ids["shelter"]
        assert "distance_km" in data[0]
        assert "urgency_score" in data[0]
        assert "composite_score" in data[0]

    def test_get_matches_nonexistent(self, client: TestClient) -> None:
        resp = client.get("/api/listings/999/matches")
        assert resp.status_code == 404


class TestMissions:
    def test_dispatch_mission(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        shelter_id = base_user_ids["shelter"]
        volunteer_id = base_user_ids["volunteer"]

        listing = FoodListing(
            donor_id=donor_id,
            title="Dispatch Test",
            food_type="PERISHABLE_COOKED",
            quantity_kg=12.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
            target_temp_celsius=4.0,
            dietary_notes="Vegetarian",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        payload = {
            "listing_ids": [listing.id],
            "shelter_id": shelter_id,
            "volunteer_id": volunteer_id,
        }
        resp = client.post("/api/missions/dispatch", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["mission_id"] > 0
        assert data["listing_ids"] == [listing.id]
        assert data["shelter_id"] == shelter_id
        assert data["volunteer_id"] == volunteer_id
        assert data["status"] == "DISPATCHED"
        assert "pickup_code" in data
        assert "dropoff_code" in data

        # Verify listing status updated
        db_session.refresh(listing)
        assert listing.status == FoodListingStatus.MATCHED.value

    def test_dispatch_rejects_non_pending(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        shelter_id = base_user_ids["shelter"]

        listing = FoodListing(
            donor_id=donor_id,
            title="Matched Already",
            food_type="PERISHABLE_COOKED",
            quantity_kg=10.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
            target_temp_celsius=4.0,
            dietary_notes="Vegetarian",
            status=FoodListingStatus.MATCHED.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        resp = client.post("/api/missions/dispatch", json={
            "listing_ids": [listing.id],
            "shelter_id": shelter_id,
        })
        assert resp.status_code == 400

    def test_get_mission_detail(self, client: TestClient, db_session: Session, base_user_ids: dict) -> None:
        # users are created at session level
        donor_id = base_user_ids["donor"]
        shelter_id = base_user_ids["shelter"]
        volunteer_id = base_user_ids["volunteer"]

        listing = FoodListing(
            donor_id=donor_id,
            title="Detail Test",
            food_type="PERISHABLE_COOKED",
            quantity_kg=8.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=4),
            target_temp_celsius=4.0,
            dietary_notes="Vegan",
            status=FoodListingStatus.PENDING.value,
            latitude=40.7128,
            longitude=-74.0060,
        )
        db_session.add(listing)
        db_session.commit()

        dispatch_resp = client.post("/api/missions/dispatch", json={
            "listing_ids": [listing.id],
            "shelter_id": shelter_id,
            "volunteer_id": volunteer_id,
        })
        mission_id = dispatch_resp.json()["mission_id"]

        resp = client.get(f"/api/missions/{mission_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == mission_id
        assert data["status"] == "DISPATCHED"
        assert data["listings"] == [listing.id]
        assert data["volunteer_id"] == volunteer_id
        assert data["verification"]["pickup_verified"] is False
        assert data["verification"]["dropoff_verified"] is False

    def test_get_mission_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/missions/999")
        assert resp.status_code == 404


class TestHealth:
    def test_health_endpoint(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "healthy", "service": "RescueRoute"}