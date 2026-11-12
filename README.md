# RescueRoute — Surplus Food Logistics Engine

A full-stack food rescue routing platform built with **FastAPI** (Python) + **Next.js 14** (React 18). Designed for real-time surplus food logistics with chain-of-custody verification, OR-Tools routing optimization, and interactive Leaflet maps.

## Features

- **Intake Dashboard** — Live queue of food donations with urgency scoring (exponential decay), CO₂ impact tracking, vehicle capacity meter
- **Smart Matching** — Ranks shelters by urgency + distance composite score using Haversine distance
- **Route Optimization** — OR-Tools TSP solver with OSRM street geometry, fallback greedy algorithm
- **Chain-of-Custody Verification** — HMAC pickup/dropoff codes, temperature compliance (danger zone 5–60°C), QR code manifests
- **Live Transit Simulation** — Animated courier on real road geometry with GPS telemetry
- **Driver Manifest Export** — Downloadable `.txt` with timestamps, HMAC tokens, temperature bounds
- **Demo Mode** — One-click reset of seeded Bangalore data

## Tech Stack

| Layer | Technology |
|-------|------------|
| API | FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Maps | React Leaflet, OSRM, OpenStreetMap |
| Routing | Google OR-Tools (CP-SAT) |
| Database | SQLite (dev), PostgreSQL-ready |
| Testing | pytest, FastAPI TestClient |

## Quick Start

```bash
# Backend
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend && npm run dev
```

- API: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

### Seed Demo Data
```bash
PYTHONPATH=. python backend/seed.py
```

### Run Tests
```bash
PYTHONPATH=. python -m pytest -v
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/listings/active` | Active food listings |
| POST | `/api/listings` | Create new donation |
| POST | `/api/listings/reset-demo` | Reset seeded data |
| GET | `/api/listings/{id}/matches` | Ranked shelters for listing |
| POST | `/api/missions/dispatch` | Dispatch mission with listings |
| POST | `/api/routes/optimize-mission/{id}` | OR-Tools route optimization |
| POST | `/api/verify/pickup` | Verify pickup + temperature |
| POST | `/api/verify/dropoff` | Verify shelter dropoff |

## Architecture

```
rescue-route/
├── backend/
│   ├── main.py                 # FastAPI app + routers
│   ├── config.py               # Pydantic Settings
│   ├── database.py             # SQLAlchemy engine/session
│   ├── models.py               # ORM models (User, Listing, Mission, Verification)
│   ├── schemas.py              # Pydantic request/response models
│   ├── seed.py                 # Demo data generator
│   └── services/
│       ├── matcher.py          # Urgency + distance scoring
│       ├── router.py           # OR-Tools TSP + OSRM
│       └── verifier.py         # HMAC + temperature safety
├── frontend/
│   ├── src/app/page.tsx        # Main dashboard
│   ├── src/components/         # RouteMap, DonateModal, VerificationModal, etc.
│   └── src/lib/api.ts          # Typed API client
└── tests/                      # 42 passing tests
```

## License

MIT
