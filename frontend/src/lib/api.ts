import {
  DispatchResponse,
  FoodListing,
  MatchResult,
  VerificationState,
  Waypoint,
} from "@/types";

/**
 * RescueRoute API client.
 *
 * Every endpoint targets the local FastAPI backend. Override the base URL at
 * build/runtime with NEXT_PUBLIC_API_BASE if the backend is not on localhost.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

/**
 * Parse a SQLite/backend timestamp as UTC.
 *
 * The backend stores naive timestamps (no timezone suffix). Browsers then
 * interpret those naive strings as *local* time, which shifts the wall clock
 * by the user's offset and makes listings look falsely EXPIRED. Appending "Z"
 * forces JavaScript to treat the value as UTC, matching how the backend
 * writes and compares it.
 */
export function parseUtc(ts: string): Date {
  if (!ts) return new Date();
  return new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z");
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body — fall back to the HTTP status text.
    }
    throw new Error(detail || `API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch all PENDING / MATCHED listings that have not yet expired, ordered by
 * descending urgency score.
 */
export async function getActiveListings(): Promise<FoodListing[]> {
  return fetchJson<FoodListing[]>("/api/listings/active");
}

/**
 * Create a brand-new food donation listing. `data` is the raw
 * FoodListingCreate payload accepted by POST /api/listings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createListing(data: any): Promise<FoodListing> {
  return fetchJson<FoodListing>("/api/listings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Refresh the seeded demo listings so their expiry windows are relative to
 * "now" again (useful after the demo data has aged out).
 */
export async function resetDemoListings(): Promise<{
  success: boolean;
  message: string;
}> {
  return fetchJson("/api/listings/reset-demo", { method: "POST" });
}

/**
 * Rank shelters for a single listing by urgency + distance composite score.
 */
export async function getMatches(listingId: number): Promise<MatchResult[]> {
  return fetchJson<MatchResult[]>(`/api/listings/${listingId}/matches`);
}

/**
 * Dispatch a rescue mission for one or more listings to a target shelter.
 */
export async function dispatchMission(
  listingIds: number[],
  shelterId: number,
  volunteerId?: number
): Promise<DispatchResponse> {
  return fetchJson<DispatchResponse>("/api/missions/dispatch", {
    method: "POST",
    body: JSON.stringify({
      listing_ids: listingIds,
      shelter_id: shelterId,
      volunteer_id: volunteerId,
    }),
  });
}

export interface OptimizedRoute {
  waypoints: Waypoint[];
  total_distance_km: number;
  estimated_duration_minutes: number;
}

/**
 * Solve the vehicle routing problem for a dispatched mission. Pass an
 * optional vehicle capacity (kg); defaults to 50 when omitted.
 */
export async function getOptimizedRoute(
  missionId: number,
  capacityKg?: number
): Promise<OptimizedRoute> {
  const capacity = capacityKg && capacityKg > 0 ? capacityKg : 50;
  return fetchJson<OptimizedRoute>(
    `/api/routes/optimize-mission/${missionId}?vehicle_capacity_kg=${capacity}`,
    { method: "POST" }
  );
}

/**
 * Verify a pickup with the 6-character handshake code and the measured
 * temperature reading (°C). Perishable cooked food must be outside the
 * 5°C–60°C danger zone.
 */
export async function verifyPickup(
  missionId: number,
  pickupCode: string,
  tempCelsius: number
): Promise<VerificationState> {
  return fetchJson<VerificationState>("/api/verify/pickup", {
    method: "POST",
    body: JSON.stringify({
      mission_id: missionId,
      pickup_code: pickupCode,
      measured_temp_celsius: tempCelsius,
    }),
  });
}

/**
 * Verify a dropoff with the 6-character handshake code.
 */
export async function verifyDropoff(
  missionId: number,
  dropoffCode: string
): Promise<VerificationState> {
  return fetchJson<VerificationState>("/api/verify/dropoff", {
    method: "POST",
    body: JSON.stringify({
      mission_id: missionId,
      dropoff_code: dropoffCode,
    }),
  });
}
