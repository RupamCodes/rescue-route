from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.database import Base, SessionLocal, engine
from backend.models import FoodListing, FoodListingStatus, User, UserRole

Base.metadata.create_all(bind=engine)
db = SessionLocal()

try:
    db.query(FoodListing).delete()
    db.query(User).delete()
    db.commit()

    now = datetime.now(timezone.utc)

    volunteer = User(
        role=UserRole.VOLUNTEER.value, name="Alex Chen (Courier)",
        email="alex.chen@rescueroute.org", phone="+91-9876543210",
        latitude=12.9716, longitude=77.5946,
    )
    shelter_a = User(
        role=UserRole.SHELTER.value, name="Asha Sadan Care Home",
        email="asha.sadan@rescueroute.org", phone="+91-9876543220",
        latitude=12.9611, longitude=77.6387,
    )
    shelter_b = User(
        role=UserRole.SHELTER.value, name="Karuna Shelter & Kitchen",
        email="karuna@rescueroute.org", phone="+91-9876543221",
        latitude=12.9352, longitude=77.6245,
    )
    donor_1 = User(
        role=UserRole.DONOR.value, name="The Grand Pavilion",
        email="grand.pavilion@rescueroute.org", phone="+91-9876543230",
        latitude=12.9784, longitude=77.6408,
    )
    donor_2 = User(
        role=UserRole.DONOR.value, name="Spice Garden Buffet",
        email="spice.garden@rescueroute.org", phone="+91-9876543231",
        latitude=12.9698, longitude=77.6502,
    )
    donor_3 = User(
        role=UserRole.DONOR.value, name="Artisan Sourdough Bakery",
        email="artisan.bakery@rescueroute.org", phone="+91-9876543232",
        latitude=12.9550, longitude=77.6300,
    )

    db.add_all([volunteer, shelter_a, shelter_b, donor_1, donor_2, donor_3])
    db.flush()

    listing_1 = FoodListing(
        donor_id=donor_1.id, title="Steamed Basmati Rice & Curry (15kg)",
        food_type="PERISHABLE_COOKED", quantity_kg=15.0,
        prepared_at=now.replace(tzinfo=None) - timedelta(minutes=20),
        expiry_timestamp=now.replace(tzinfo=None) + timedelta(minutes=40),
        target_temp_celsius=65.0, dietary_notes="Vegetarian",
        status=FoodListingStatus.PENDING.value,
        latitude=12.9784, longitude=77.6408,
    )
    listing_2 = FoodListing(
        donor_id=donor_2.id, title="Chilled Paneer Gravy (10kg)",
        food_type="PERISHABLE_COOKED", quantity_kg=10.0,
        prepared_at=now.replace(tzinfo=None) - timedelta(hours=1),
        expiry_timestamp=now.replace(tzinfo=None) + timedelta(minutes=180),
        target_temp_celsius=4.0, dietary_notes="Vegetarian, Contains dairy",
        status=FoodListingStatus.PENDING.value,
        latitude=12.9698, longitude=77.6502,
    )
    listing_3 = FoodListing(
        donor_id=donor_3.id, title="Fresh Sourdough Loaves (8kg)",
        food_type="BAKERY", quantity_kg=8.0,
        prepared_at=now.replace(tzinfo=None) - timedelta(hours=2),
        expiry_timestamp=now.replace(tzinfo=None) + timedelta(minutes=480),
        target_temp_celsius=22.0, dietary_notes="Vegan",
        status=FoodListingStatus.PENDING.value,
        latitude=12.9550, longitude=77.6300,
    )

    db.add_all([listing_1, listing_2, listing_3])
    db.commit()

    print("\n" + "=" * 80)
    print("RESCUEROUTE DEMO DATA SEEDED")
    print("=" * 80)
    print(f"{'Role':<12} {'Name':<30} {'Lat':>10} {'Lng':>11}")
    print("-" * 80)
    for u in [volunteer, shelter_a, shelter_b, donor_1, donor_2, donor_3]:
        print(f"{u.role:<12} {u.name:<30} {u.latitude:>10.4f} {u.longitude:>11.4f}")
    print("-" * 80)
    print(f"\n{'ID':<4} {'Title':<38} {'Type':<20} {'Qty(kg)':>7} {'Expires In':>12} {'Temp(°C)':>8}")
    print("-" * 80)
    for l in [listing_1, listing_2, listing_3]:
        exp_naive = l.expiry_timestamp.replace(tzinfo=None) if l.expiry_timestamp.tzinfo else l.expiry_timestamp
        now_naive = now.replace(tzinfo=None)
        mins = int((exp_naive - now_naive).total_seconds() / 60)
        print(f"{l.id:<4} {l.title:<38} {l.food_type:<20} {l.quantity_kg:>7.1f} {f'{mins}m':>12} {l.target_temp_celsius:>8.1f}")
    print("=" * 80 + "\n")

finally:
    db.close()