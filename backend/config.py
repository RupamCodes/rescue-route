from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration sourced from the environment."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="RESCUEROUTE_")

    database_url: str = "sqlite:///./rescue_route.db"
    app_name: str = "RescueRoute"
    app_version: str = "0.1.0"


settings = Settings()