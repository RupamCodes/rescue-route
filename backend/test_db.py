from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from backend.database import Base, SessionLocal, engine
from backend.models import FoodListing, User


def main() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        donor = User(
            role="DONOR",
            name="Test Donor",
            email="donor@example.com",
            phone="555-0001",
            latitude=40.7128,
            longitude=-74.0060,
        )
        db.add(donor)
        db.flush()

        listing = FoodListing(
            donor_id=donor.id,
            title="Surplus Catered Meals",
            food_type="PERISHABLE_COOKED",
            quantity_kg=24.0,
            prepared_at=datetime.now(timezone.utc) - timedelta(hours=2),
            expiry_timestamp=datetime.now(timezone.utc) + timedelta(hours=4),
            target_temp_celsius=4.0,
            dietary_notes="Vegetarian",
            status="PENDING",
            latitude=40.7130,
            longitude=-74.0062,
        )
        db.add(listing)
        db.commit()

        result = db.execute(
            select(User).where(User.email == "donor@example.com")
        ).scalar_one()
        assert result.role == "DONOR"
        assert result.id == donor.id

        fetched = db.execute(
            select(FoodListing).where(FoodListing.donor_id == result.id)
        ).scalar_one()
        assert fetched.title == "Surplus Catered Meals"
        assert fetched.quantity_kg == 24.0

    print("DB INITIALIZATION SUCCESSFUL")


if __name__ == "__main__":
    main()