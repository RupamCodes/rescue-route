from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings

engine: Engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """Shared declarative base for all RescueRoute models."""


def get_db() -> Generator[Session, None, None]:
    """Yield a transactional DB session, closing it on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()