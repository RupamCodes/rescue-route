from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import listings, missions, routing, verification

app = FastAPI(
    title="RescueRoute Logistics Engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings.router)
app.include_router(missions.router)
app.include_router(routing.router)
app.include_router(verification.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "RescueRoute"}