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
from backend.services.verifier import validate_food_safety_temp, verify_token


@pytest.fixture
def test_engine():
    import tempfile, os
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
    donor = User(role=UserRole.DONOR.value, name="Donor", email="d@test.com", phone="1",
                 latitude=40.7128, longitude=-74.0060)
    shelter = User(role=UserRole.SHELTER.value, name="Shelter", email="s@test.com", phone="2",
                   latitude=40.7130, longitude=-74.0062)
    volunteer = User(role=UserRole.VOLUNTEER.value, name="Volunteer", email="v@test.com", phone="3",
                     latitude=40.7140, longitude=-74.0070)
    db.add_all([donor, shelter, volunteer])
    db.commit()
    return {"donor": donor.id, "shelter": shelter.id, "volunteer": volunteer.id}


class TestValidateFoodSafetyTemp:
    def test_cold_food_passes(self) -> None:
        valid, msg = validate_food_safety_temp(["PERISHABLE_COOKED"], 3.0)
        assert valid is True

    def test_hot_food_passes(self) -> None:
        valid, msg = validate_food_safety_temp(["PERISHABLE_COOKED"], 65.0)
        assert valid is True

    def test_danger_zone_fails(self) -> None:
        valid, msg = validate_food_safety_temp(["PERISHABLE_COOKED"], 32.0)
        assert valid is False
        assert "danger zone" in msg.lower()

    def test_boundary_5c_passes(self) -> None:
        valid, _ = validate_food_safety_temp(["PERISHABLE_COOKED"], 5.0)
        assert valid is True

    def test_boundary_60c_passes(self) -> None:
        valid, _ = validate_food_safety_temp(["PERISHABLE_COOKED"], 60.0)
        assert valid is True

    def test_ambient_passes_for_non_perishable(self) -> None:
        valid, _ = validate_food_safety_temp(["BAKERY"], 25.0)
        assert valid is True


class TestVerifyToken:
    def test_case_insensitive(self) -> None:
        assert verify_token("abc123", "ABC123") is True

    def test_whitespace_tolerant(self) -> None:
        assert verify_token("  abc  ", "ABC") is True

    def test_rejects_invalid(self) -> None:
        assert verify_token("abc123", "def456") is False


class TestPickupVerification:
    def test_dropoff_before_pickup_fails(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        # Try dropoff before pickup
        resp = client.post("/api/verify/dropoff", json={"mission_id": mission.id, "dropoff_code": "XYZ"})
        assert resp.status_code == 400
        assert "pickup not verified" in resp.json()["detail"].lower()

    def test_invalid_pickup_code_fails(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        resp = client.post("/api/verify/pickup", json={
            "mission_id": mission.id, "pickup_code": "WRONG", "measured_temp_celsius": 4.0
        })
        assert resp.status_code == 400
        assert "invalid pickup code" in resp.json()["detail"].lower()

    def test_danger_zone_temp_fails(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        # Get the actual pickup code
        from backend.models import HandshakeVerification
        v = db_session.query(HandshakeVerification).filter_by(mission_id=mission.id).first()
        code = v.pickup_code_hash

        resp = client.post("/api/verify/pickup", json={
            "mission_id": mission.id, "pickup_code": code, "measured_temp_celsius": 32.0
        })
        assert resp.status_code == 422
        assert "danger zone" in resp.json()["detail"].lower()

    def test_successful_pickup_cold(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        v = db_session.query(HandshakeVerification).filter_by(mission_id=mission.id).first()
        code = v.pickup_code_hash

        resp = client.post("/api/verify/pickup", json={
            "mission_id": mission.id, "pickup_code": code, "measured_temp_celsius": 3.0
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["status"] == "PICKED_UP"

        db_session.refresh(mission)
        assert mission.status == "PICKED_UP"
        db_session.refresh(listing)
        assert listing.status == "IN_TRANSIT"


class TestDropoffVerification:
    def test_successful_dropoff(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        v = db_session.query(HandshakeVerification).filter_by(mission_id=mission.id).first()
        pickup_code, dropoff_code = v.pickup_code_hash, v.dropoff_code_hash

        # Pickup first
        resp = client.post("/api/verify/pickup", json={
            "mission_id": mission.id, "pickup_code": pickup_code, "measured_temp_celsius": 3.0
        })
        assert resp.status_code == 200

        # Then dropoff
        resp = client.post("/api/verify/dropoff", json={
            "mission_id": mission.id, "dropoff_code": dropoff_code
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["status"] == "COMPLETED"

        db_session.refresh(mission)
        assert mission.status == "COMPLETED"
        assert mission.completed_at is not None
        db_session.refresh(listing)
        assert listing.status == "DELIVERED"

    def test_invalid_dropoff_code_fails(self, client: TestClient, db_session: Session) -> None:
        users = create_test_users(db_session)
        listing = FoodListing(donor_id=users["donor"], title="Test", food_type="PERISHABLE_COOKED",
                              quantity_kg=10.0, prepared_at=datetime.now(timezone.utc) - timedelta(hours=1),
                              expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=3),
                              target_temp_celsius=4.0, dietary_notes="V", status=FoodListingStatus.PENDING.value,
                              latitude=40.7128, longitude=-74.0060)
        db_session.add(listing)
        db_session.commit()

        mission = RescueMission(volunteer_id=users["volunteer"], shelter_id=users["shelter"],
                                status=MissionStatus.DISPATCHED.value)
        mission.listings.append(listing)
        db_session.add(mission)
        db_session.flush()

        from backend.models import HandshakeVerification
        db_session.add(HandshakeVerification(mission_id=mission.id, pickup_code_hash="ABC123", dropoff_code_hash="DEF456",
                                             is_pickup_verified=False, is_dropoff_verified=False))
        db_session.commit()

        v = db_session.query(HandshakeVerification).filter_by(mission_id=mission.id).first()
        pickup_code = v.pickup_code_hash

        # Pickup first
        client.post("/api/verify/pickup", json={
            "mission_id": mission.id, "pickup_code": pickup_code, "measured_temp_celsius": 3.0
        })

        # Bad dropoff
        resp = client.post("/api/verify/dropoff", json={
            "mission_id": mission.id, "dropoff_code": "WRONG"
        })
        assert resp.status_code == 400
        assert "invalid dropoff code" in resp.json()["detail"].lower()