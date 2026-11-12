"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  Clock,
  MapPin,
  Navigation,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Truck,
  Weight,
} from "lucide-react";
import {
  dispatchMission,
  getActiveListings,
  getMatches,
  getOptimizedRoute,
  parseUtc,
  resetDemoListings,
} from "@/lib/api";
import type {
  DispatchResponse,
  FoodListing,
  MatchResult,
  Waypoint,
} from "@/types";
import UrgencyBadge from "@/components/UrgencyBadge";
import DonateModal from "@/components/DonateModal";
import VerificationModal from "@/components/VerificationModal";
import type { TelemetryState } from "@/components/RouteMap";

// Leaflet requires `window`, so the map must never render on the server.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full rounded-xl bg-stone-100 animate-pulse" />
  ),
});

const VEHICLE_CAPACITY_KG = 50;

function remainingMins(expiry: string): number {
  return Math.max(0, parseUtc(expiry).getTime() - Date.now()) / 60000;
}

function categoryLabel(foodType: string): string {
  switch (foodType) {
    case "PERISHABLE_COOKED":
      return "Cooked Meal";
    case "RAW_PRODUCE":
      return "Fresh Produce";
    case "BAKERY":
      return "Artisan Bakery";
    case "PACKAGED":
      return "Packaged";
    default:
      return foodType;
  }
}

// ---------------------------------------------------------------------------
// Deterministic QR-style matrix badges (pure inline SVG, zero dependencies)
// ---------------------------------------------------------------------------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQrMatrix(value: string, n: number): boolean[][] {
  const rng = mulberry32(hashString(value));
  const m: boolean[][] = Array.from({ length: n }, () =>
    Array<boolean>(n).fill(false)
  );

  const drawFinder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const border = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        m[r + i][c + j] = border || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }

  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r === 6 || c === 6 || inFinder(r, c)) continue;
      m[r][c] = rng() < 0.5;
    }
  }
  return m;
}

function QrBadge({ value, size = 44 }: { value: string; size?: number }) {
  const n = 21;
  const modules = useMemo(() => buildQrMatrix(value, n), [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      className="rounded-md border border-stone-200 bg-white flex-shrink-0"
      shapeRendering="crispEdges"
      aria-label={`QR code for ${value}`}
    >
      <rect width={n} height={n} fill="#ffffff" />
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill="#18181b"
            />
          ) : null
        )
      )}
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Perishability curve: W(t) = 100 * e^(-0.0035 t)
// ---------------------------------------------------------------------------
function PerishabilityCurve({
  listings,
  selectedIds,
  onSelect,
}: {
  listings: FoodListing[];
  selectedIds: number[];
  onSelect: (id: number) => void;
}) {
  const W = 640;
  const H = 240;
  const left = 44;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const maxT = 480;
  const pw = W - left - right;
  const ph = H - top - bottom;

  const x = (t: number) => left + (Math.min(Math.max(t, 0), maxT) / maxT) * pw;
  const y = (w: number) => top + (1 - w / 100) * ph;

  const curve = useMemo(() => {
    let d = "";
    for (let t = 0; t <= maxT; t += 8) {
      const w = 100 * Math.exp(-0.0035 * t);
      d += `${t === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(w).toFixed(1)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {[0, 25, 50, 75, 100].map((w) => (
        <line
          key={`y-${w}`}
          x1={left}
          y1={y(w)}
          x2={W - right}
          y2={y(w)}
          stroke="#e7e5e4"
          strokeWidth={1}
        />
      ))}
      {[0, 120, 240, 360, 480].map((t) => (
        <line
          key={`x-${t}`}
          x1={x(t)}
          y1={top}
          x2={x(t)}
          y2={H - bottom}
          stroke="#e7e5e4"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      ))}

      <line
        x1={left}
        y1={H - bottom}
        x2={W - right}
        y2={H - bottom}
        stroke="#d6d3d1"
        strokeWidth={1}
      />
      <line
        x1={left}
        y1={top}
        x2={left}
        y2={H - bottom}
        stroke="#d6d3d1"
        strokeWidth={1}
      />

      <path
        d={curve}
        fill="none"
        stroke="#0f766e"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {[100, 75, 50, 25, 0].map((w) => (
        <text
          key={`yl-${w}`}
          x={left - 8}
          y={y(w) + 3}
          textAnchor="end"
          fontSize={9}
          fill="#a8a29e"
        >
          {w}
        </text>
      ))}
      {[
        { t: 0, l: "0" },
        { t: 120, l: "2h" },
        { t: 240, l: "4h" },
        { t: 360, l: "6h" },
        { t: 480, l: "8h" },
      ].map((p) => (
        <text
          key={`xl-${p.t}`}
          x={x(p.t)}
          y={H - bottom + 14}
          textAnchor="middle"
          fontSize={9}
          fill="#a8a29e"
        >
          {p.l}
        </text>
      ))}

      {listings.map((l) => {
        const t = remainingMins(l.expiry_timestamp);
        const w = 100 * Math.exp(-0.0035 * t);
        const isSel = selected.has(l.id);
        return (
          <circle
            key={l.id}
            cx={x(t)}
            cy={y(w)}
            r={isSel ? 6 : 4.5}
            fill="#0f766e"
            fillOpacity={isSel ? 1 : 0.75}
            stroke={isSel ? "#0f766e" : "#ffffff"}
            strokeWidth={2}
            className="cursor-pointer"
            onClick={() => onSelect(l.id)}
          >
            <title>{`${l.title} — ${Math.round(t)}m to expiry (${w.toFixed(
              0
            )} pts)`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

type MissionStep = "DISPATCHED" | "PICKED_UP" | "COMPLETED";

export default function DispatchDashboard() {
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routeMeta, setRouteMeta] = useState<{
    distance: number;
    minutes: number;
  } | null>(null);
  const [mission, setMission] = useState<DispatchResponse | null>(null);
  const [missionStep, setMissionStep] = useState<MissionStep>("DISPATCHED");

  const [selectedShelterId, setSelectedShelterId] = useState(2);
  const [shelterOptions, setShelterOptions] = useState<
    { id: number; name: string }[]
  >([
    { id: 2, name: "Asha Sadan Care Home" },
    { id: 3, name: "Karuna Shelter & Kitchen" },
  ]);
  const [expandedListingId, setExpandedListingId] = useState<number | null>(
    null
  );
  const [matchesCache, setMatchesCache] = useState<Record<number, MatchResult[]>>(
    {}
  );
  const [matchesLoading, setMatchesLoading] = useState<Record<number, boolean>>(
    {}
  );

  const [loading, setLoading] = useState(true);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");

  const [showDonate, setShowDonate] = useState(false);
  const [verifyMode, setVerifyMode] = useState<"PICKUP" | "DROPOFF" | null>(
    null
  );
  const [simulateLive, setSimulateLive] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);

  const fetchListings = useCallback(async () => {
    try {
      const data = await getActiveListings();
      setListings(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load active listings"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const totals = useMemo(() => {
    const totalKg = listings.reduce((s, l) => s + (l.quantity_kg || 0), 0);
    const urgentCount = listings.filter(
      (l) => remainingMins(l.expiry_timestamp) < 180
    ).length;
    return { totalKg, urgentCount };
  }, [listings]);

  const selectedKg = useMemo(
    () =>
      listings
        .filter((l) => selectedIds.includes(l.id))
        .reduce((s, l) => s + (l.quantity_kg || 0), 0),
    [listings, selectedIds]
  );

  const orderedWaypoints = useMemo(
    () => [...waypoints].sort((a, b) => a.order - b.order),
    [waypoints]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleMatches = useCallback(
    async (id: number) => {
      if (expandedListingId === id) {
        setExpandedListingId(null);
        return;
      }
      setExpandedListingId(id);
      if (matchesCache[id]) return;
      setMatchesLoading((m) => ({ ...m, [id]: true }));
      try {
        const matches = await getMatches(id);
        setMatchesCache((c) => ({ ...c, [id]: matches }));
        setShelterOptions((opts) => {
          const next = [...opts];
          for (const m of matches) {
            if (!next.some((o) => o.id === m.shelter_id)) {
              next.push({ id: m.shelter_id, name: m.shelter_name });
            }
          }
          return next;
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to rank shelters"
        );
      } finally {
        setMatchesLoading((m) => ({ ...m, [id]: false }));
      }
    },
    [expandedListingId, matchesCache]
  );

  const handleDispatch = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setDispatchLoading(true);
    setError("");
    try {
      const dispatched = await dispatchMission(selectedIds, selectedShelterId);
      const route = await getOptimizedRoute(dispatched.mission_id);

      setMission(dispatched);
      setMissionStep("DISPATCHED");
      setWaypoints(route.waypoints);
      setRouteMeta({
        distance: route.total_distance_km,
        minutes: route.estimated_duration_minutes,
      });
      setSimulateLive(false);
      setTelemetry(null);
      await fetchListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setDispatchLoading(false);
    }
  }, [selectedIds, selectedShelterId, fetchListings]);

  const handleResetDemo = useCallback(async () => {
    setResetLoading(true);
    setError("");
    try {
      await resetDemoListings();
      setSelectedIds([]);
      setMission(null);
      setWaypoints([]);
      setRouteMeta(null);
      setExpandedListingId(null);
      setMatchesCache({});
      setSimulateLive(false);
      setTelemetry(null);
      await fetchListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetLoading(false);
    }
  }, [fetchListings]);

  const handleVerifySuccess = useCallback(async () => {
    await fetchListings();
    if (verifyMode === "PICKUP") {
      setMissionStep("PICKED_UP");
    } else {
      setMission(null);
      setWaypoints([]);
      setRouteMeta(null);
      setSelectedIds([]);
      setMissionStep("COMPLETED");
      setSimulateLive(false);
      setTelemetry(null);
    }
  }, [verifyMode, fetchListings]);

  const exportManifest = useCallback(() => {
    if (!mission) return;
    const startMs = parseUtc(mission.created_at).getTime();
    const n = orderedWaypoints.length;
    const perStopMin = n > 1 && routeMeta ? routeMeta.minutes / (n - 1) : 0;

    const lines: string[] = [
      "RESCUEROUTE — DRIVER MANIFEST",
      "===============================",
      `Mission ID: ${mission.mission_id}`,
      `Status: ${missionStep}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "HMAC VERIFICATION TOKENS",
      `  Pickup Code:  ${mission.pickup_code}`,
      `  Dropoff Code: ${mission.dropoff_code}`,
      "",
      "TEMPERATURE COMPLIANCE BOUNDS",
      "  Danger zone (rejected): 5.0°C – 60.0°C",
      "  Safe holding: <= 5.0°C or >= 60.0°C",
      "",
      `ROUTE: ${routeMeta ? routeMeta.distance.toFixed(2) : "—"} km, ${
        routeMeta ? routeMeta.minutes.toFixed(1) : "—"
      } min`,
      "ORDERED WAYPOINTS (estimated timestamps):",
    ];

    orderedWaypoints.forEach((wp, i) => {
      const est = new Date(startMs + i * perStopMin * 60000);
      lines.push(
        `  [${i}] ${wp.type.padEnd(8)} ${wp.label}  (est. ${est.toLocaleTimeString()})`
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver-manifest-${mission.mission_id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [mission, missionStep, routeMeta, orderedWaypoints]);

  const overCapacity = selectedKg > VEHICLE_CAPACITY_KG;

  return (
    <div className="bg-[#F5F4F0] text-stone-900 min-h-screen font-sans antialiased">
      {/* ------------------------------------------------------------------ */}
      {/* Top navigation bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-stone-200/80 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <circle cx="5" cy="5" r="2.2" fill="currentColor" />
              <circle cx="19" cy="5" r="2.2" fill="currentColor" />
              <circle cx="12" cy="18.5" r="2.6" fill="currentColor" />
              <path
                d="M5 7.2 10.8 15.9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M19 7.2 13.2 15.9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-stone-900">
              RescueRoute
            </span>
            <span className="bg-stone-100 text-stone-600 border border-stone-200/80 text-[11px] px-2.5 py-0.5 rounded-full font-medium">
              Dispatch Engine v2.4
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-5 bg-[#F5F4F0] border border-stone-200/80 px-4 py-1.5 rounded-full text-xs text-stone-600">
          <span className="flex items-center gap-1.5">
            <Weight className="w-3.5 h-3.5" strokeWidth={1.75} />
            Rescuable:{" "}
            <strong className="text-stone-900 font-semibold">
              {totals.totalKg.toFixed(1)} kg
            </strong>
          </span>
          <span className="h-3 w-px bg-stone-300" />
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            CO₂ Prevented:{" "}
            <strong className="text-teal-700 font-semibold">
              {(totals.totalKg * 2.5).toFixed(1)} kg
            </strong>
          </span>
          <span className="h-3 w-px bg-stone-300" />
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
            Urgent Windows:{" "}
            <strong className="text-orange-700 font-semibold">
              {totals.urgentCount} active
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDemo}
            disabled={resetLoading}
            className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200/90 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${resetLoading ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
            Reset Demo Clock
          </button>
          <button
            onClick={fetchListings}
            className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200/90 p-1.5 rounded-lg"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setShowDonate(true)}
            className="bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            New Donation
          </button>
        </div>
      </nav>

      {error && (
        <div className="max-w-[1440px] mx-auto px-6 pt-4">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-red-200/80 bg-red-50 text-red-700 text-sm">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" strokeWidth={1.75} />
              {error}
            </span>
            <button
              onClick={() => setError("")}
              className="text-red-500 hover:text-red-700 text-xs font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main workspace                                                       */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-[1440px] mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
          {/* Intake queue + capacity */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-900">
                Surplus Intake Queue
              </h2>
              <button className="text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 border border-teal-200/60 px-2.5 py-1 rounded-lg">
                Auto-Batch Urgent
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-2">
              {selectedKg.toFixed(1)} / {VEHICLE_CAPACITY_KG}.0 kg vehicle
              capacity
            </p>
            <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overCapacity ? "bg-red-500" : "bg-teal-600"
                }`}
                style={{
                  width: `${Math.min(100, (selectedKg / VEHICLE_CAPACITY_KG) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Listing cards */}
          {loading ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-10 text-center text-sm text-stone-400">
              Loading intake queue…
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-10 text-center text-sm text-stone-400">
              No active listings.{" "}
              <button
                onClick={() => setShowDonate(true)}
                className="text-teal-700 hover:text-teal-800 font-medium"
              >
                Donate food →
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {listings.map((listing) => {
                const isSelected = selectedIds.includes(listing.id);
                return (
                  <div
                    key={listing.id}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F0FDFA]/70 border-teal-600/80 ring-1 ring-teal-600/20 shadow-xs"
                        : "bg-white hover:bg-stone-50/70 border-stone-200/80"
                    }`}
                    onClick={() => toggleSelect(listing.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "bg-teal-700 border-teal-700 text-white"
                            : "border-stone-300 text-transparent"
                        }`}
                      >
                        {isSelected && (
                          <Check className="w-3 h-3" strokeWidth={2.5} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-stone-900 text-sm leading-snug">
                            {listing.title}
                          </p>
                          <UrgencyBadge
                            expiryTimestamp={listing.expiry_timestamp}
                            urgencyScore={listing.urgency_score ?? 0}
                          />
                        </div>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-stone-500">
                          <span className="flex items-center gap-1">
                            <Weight
                              className="w-3.5 h-3.5 text-stone-400"
                              strokeWidth={1.75}
                            />
                            {listing.quantity_kg} kg
                          </span>
                          <span className="flex items-center gap-1">
                            <Thermometer
                              className="w-3.5 h-3.5 text-stone-400"
                              strokeWidth={1.75}
                            />
                            {listing.target_temp_celsius}°C target
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin
                              className="w-3.5 h-3.5 text-stone-400"
                              strokeWidth={1.75}
                            />
                            {listing.latitude.toFixed(3)},{" "}
                            {listing.longitude.toFixed(3)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200/70 text-[11px] font-medium text-stone-600">
                            {categoryLabel(listing.food_type)}
                          </span>
                        </div>

                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3"
                        >
                          <button
                            onClick={() => toggleMatches(listing.id)}
                            className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1.5"
                          >
                            <Building2
                              className="w-3.5 h-3.5"
                              strokeWidth={1.75}
                            />
                            Find Top Shelters
                          </button>

                          {expandedListingId === listing.id && (
                            <div className="mt-2 space-y-1.5">
                              {matchesLoading[listing.id] ? (
                                <p className="text-xs text-stone-400">
                                  Ranking shelters…
                                </p>
                              ) : (
                                (matchesCache[listing.id] || []).map((m) => (
                                  <div
                                    key={m.shelter_id}
                                    className="flex items-center justify-between gap-2 rounded-lg bg-[#FAF9F6] border border-stone-200/60 px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-stone-800 truncate">
                                        {m.shelter_name}
                                      </p>
                                      <p className="text-[11px] text-stone-500">
                                        {m.distance_km.toFixed(2)} km •{" "}
                                        {m.composite_score.toFixed(0)} pts
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        setSelectedShelterId(m.shelter_id)
                                      }
                                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors flex-shrink-0 ${
                                        selectedShelterId === m.shelter_id
                                          ? "bg-teal-700 border-teal-700 text-white"
                                          : "bg-white border-stone-200/80 text-stone-600 hover:bg-stone-50"
                                      }`}
                                    >
                                      {selectedShelterId === m.shelter_id && (
                                        <Check
                                          className="w-3 h-3"
                                          strokeWidth={2.5}
                                        />
                                      )}
                                      Select Shelter
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dispatch footer */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs space-y-3">
            <label className="text-xs font-medium text-stone-600">
              Target Shelter
            </label>
            <select
              value={selectedShelterId}
              onChange={(e) => setSelectedShelterId(Number(e.target.value))}
              className="w-full bg-[#FAF9F6] border border-stone-200/90 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            >
              {shelterOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} (ID #{o.id})
                </option>
              ))}
            </select>

            <button
              onClick={handleDispatch}
              disabled={selectedIds.length === 0 || dispatchLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
            >
              {dispatchLoading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Truck className="w-4 h-4" strokeWidth={1.75} />
              )}
              Optimize &amp; Dispatch Pooled Route ({selectedIds.length} stops)
              {!dispatchLoading && (
                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-5">
          {/* Map card */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-2.5 shadow-xs">
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Navigation className="w-4 h-4 text-teal-700" strokeWidth={1.75} />
                Live Spatial Routing &amp; Telemetry
              </div>
              <div className="flex items-center gap-2">
                {telemetry && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium text-teal-700 bg-teal-50 border border-teal-200/60 px-2.5 py-1 rounded-full">
                    <Truck className="w-3 h-3" strokeWidth={1.75} />
                    {telemetry.speedKmh} km/h • {telemetry.segment} •{" "}
                    {telemetry.remainingKm.toFixed(2)} km left
                  </span>
                )}
                <span className="text-[11px] font-medium text-stone-500 bg-stone-100 border border-stone-200/70 px-2.5 py-1 rounded-full">
                  {waypoints.length > 0
                    ? `${waypoints.length} Waypoints Computed via OR-Tools`
                    : `${listings.length} Active Nodes Mapped`}
                </span>
              </div>
            </div>
            <RouteMap
              listings={listings}
              selectedIds={selectedIds}
              waypoints={waypoints}
              onSelectListing={toggleSelect}
              simulateLive={simulateLive}
              onTelemetry={setTelemetry}
            />
          </div>

          {/* Bottom panel: mission manifest or perishability curve */}
          {mission ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className="w-4 h-4 text-teal-700"
                    strokeWidth={1.75}
                  />
                  <h3 className="text-sm font-semibold text-stone-900">
                    Chain-of-Custody &amp; Route Manifest
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportManifest}
                    className="flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200/80 bg-white hover:bg-stone-50 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Export Driver Manifest
                  </button>
                  <span className="text-xs text-stone-400 font-mono">
                    Mission #{mission.mission_id}
                  </span>
                </div>
              </div>

              {/* Status stepper */}
              <div className="flex items-center gap-2">
                {["Dispatched", "Pickup & Temp Verified", "Delivered to Shelter"].map(
                  (label, i) => {
                    const current =
                      missionStep === "DISPATCHED"
                        ? 0
                        : missionStep === "PICKED_UP"
                          ? 1
                          : 2;
                    const done = i < current;
                    const active = i === current;
                    return (
                      <div key={label} className="flex-1 flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                              done
                                ? "bg-teal-700 text-white"
                                : active
                                  ? "bg-stone-900 text-white"
                                  : "bg-stone-100 text-stone-400 border border-stone-200"
                            }`}
                          >
                            {done ? (
                              <Check className="w-3 h-3" strokeWidth={2.5} />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              active ? "text-stone-900" : "text-stone-400"
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        {i < 2 && (
                          <span
                            className={`flex-1 h-px ${
                              i < current ? "bg-teal-700" : "bg-stone-200"
                            }`}
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </div>

              {/* Metrics + tokens */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <Navigation className="w-3 h-3" strokeWidth={1.75} />
                    Distance
                  </p>
                  <p className="text-sm font-semibold text-stone-900 mt-1">
                    {routeMeta ? routeMeta.distance.toFixed(2) : "—"} km
                  </p>
                </div>
                <div className="bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" strokeWidth={1.75} />
                    Transit
                  </p>
                  <p className="text-sm font-semibold text-stone-900 mt-1">
                    {routeMeta ? routeMeta.minutes.toFixed(1) : "—"} min
                  </p>
                </div>
                <div className="bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <QrCode className="w-3 h-3" strokeWidth={1.75} />
                    Pickup Code
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="bg-[#FAF9F6] border border-stone-200 font-mono text-xs px-2.5 py-1 rounded-md text-stone-900 font-semibold">
                      {mission.pickup_code}
                    </span>
                    <QrBadge value={mission.pickup_code} size={38} />
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <QrCode className="w-3 h-3" strokeWidth={1.75} />
                    Dropoff Code
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="bg-[#FAF9F6] border border-stone-200 font-mono text-xs px-2.5 py-1 rounded-md text-stone-900 font-semibold">
                      {mission.dropoff_code}
                    </span>
                    <QrBadge value={mission.dropoff_code} size={38} />
                  </div>
                </div>
              </div>

              {/* Waypoint timeline */}
              <div className="space-y-1.5">
                {orderedWaypoints.map((wp) => (
                  <div key={wp.order} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-700 flex-shrink-0" />
                    <span className="text-xs text-stone-600">{wp.label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-stone-400">
                      {wp.type}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live transit simulator */}
              <button
                onClick={() => {
                  if (simulateLive) {
                    setSimulateLive(false);
                    setTelemetry(null);
                  } else {
                    setSimulateLive(true);
                  }
                }}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  simulateLive
                    ? "bg-teal-700 border-teal-700 text-white"
                    : "bg-white border-stone-200/80 text-stone-700 hover:bg-stone-50"
                }`}
              >
                <Truck className="w-4 h-4" strokeWidth={1.75} />
                {simulateLive ? "Stop Live Transit" : "Simulate Live Transit"}
              </button>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {missionStep === "DISPATCHED" && (
                  <button
                    onClick={() => setVerifyMode("PICKUP")}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-sm font-medium transition-all"
                  >
                    <Thermometer className="w-4 h-4" strokeWidth={1.75} />
                    Verify Pickup &amp; Safe Temp
                  </button>
                )}
                {missionStep === "PICKED_UP" && (
                  <button
                    onClick={() => setVerifyMode("DROPOFF")}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium transition-all"
                  >
                    <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                    Complete Shelter Handshake
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-700" strokeWidth={1.75} />
                  <h3 className="text-sm font-semibold text-stone-900">
                    Algorithmic Perishability Curve
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-stone-400">
                  W(t) = 100 · e^(-0.0035t)
                </span>
              </div>
              <p className="text-xs text-stone-500 mb-3">
                Remaining freshness value over time. Tap a node to select it for
                dispatch.
              </p>
              <PerishabilityCurve
                listings={listings}
                selectedIds={selectedIds}
                onSelect={toggleSelect}
              />
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <DonateModal
        open={showDonate}
        onClose={() => setShowDonate(false)}
        onCreated={() => {
          setShowDonate(false);
          fetchListings();
        }}
      />

      {mission && verifyMode && (
        <VerificationModal
          mode={verifyMode}
          missionId={mission.mission_id}
          code={
            verifyMode === "PICKUP"
              ? mission.pickup_code
              : mission.dropoff_code
          }
          onSuccess={handleVerifySuccess}
          onClose={() => setVerifyMode(null)}
        />
      )}
    </div>
  );
}
