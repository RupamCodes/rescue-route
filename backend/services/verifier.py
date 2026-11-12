from __future__ import annotations

import hmac

PERISHABLE_COOKED = "PERISHABLE_COOKED"
DANGER_ZONE_LOW = 5.0
DANGER_ZONE_HIGH = 60.0
PHYSICAL_MIN = -20.0
PHYSICAL_MAX = 100.0


def validate_food_safety_temp(
    food_types: list[str], measured_temp_celsius: float
) -> tuple[bool, str]:
    """Validate food temperature against safety rules."""
    if not PHYSICAL_MIN <= measured_temp_celsius <= PHYSICAL_MAX:
        return False, "Sensor reading out of physical bounds."

    if PERISHABLE_COOKED in food_types:
        if DANGER_ZONE_LOW < measured_temp_celsius < DANGER_ZONE_HIGH:
            return (
                False,
                "Food temperature in danger zone (5°C - 60°C). Rejecting pickup for safety.",
            )

    return True, "Temperature verified within safe holding bounds."


def verify_token(provided_code: str, stored_hash_or_code: str) -> bool:
    """Constant-time comparison for pickup/dropoff codes."""
    return hmac.compare_digest(
        provided_code.strip().upper(), stored_hash_or_code.strip().upper()
    )