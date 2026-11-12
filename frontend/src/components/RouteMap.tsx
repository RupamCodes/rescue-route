"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { parseUtc } from "@/lib/api";
import { FoodListing } from "@/types";

// ---------------------------------------------------------------------------
// Live courier telemetry shape reported to the parent for the map header pill
// ---------------------------------------------------------------------------
export interface TelemetryState {
  speedKmh: number;
  segment: string;
  remainingKm: number;
}

// ---------------------------------------------------------------------------
// Architectural divIcon builders (elevated pills & beacons, no emoji)
// ---------------------------------------------------------------------------
function selectedDonorIcon(): L.DivIcon {
  const html = `
    <div style="border:2px solid #0f766e;background:#ffffff;color:#0f172a;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.12);font-weight:600;font-size:11px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#0f766e;"></span>
    </div>`;

  return L.divIcon({
    className: "rr-marker",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function donorIcon(): L.DivIcon {
  const html = `
    <div style="border:2px solid #ffffff;background:#ea580c;width:16px;height:16px;border-radius:9999px;box-shadow:0 2px 6px rgba(234,88,12,0.35);"></div>`;

  return L.divIcon({
    className: "rr-marker",
    html,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function waypointIcon(step: string): L.DivIcon {
  const fontSize = step.length > 2 ? "9px" : "11px";
  const html = `
    <div style="background:#18181b;color:#ffffff;border:2px solid #ffffff;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:${fontSize};font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,0.15);">${step}</div>`;

  return L.divIcon({
    className: "rr-marker",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

function courierIcon(): L.DivIcon {
  const html = `
    <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="6" fill="none" stroke="#0f766e" stroke-width="2.5" opacity="0.9">
        <animate attributeName="r" values="5;13" dur="1.3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0" dur="1.3s" repeatCount="indefinite" />
      </circle>
      <circle cx="14" cy="14" r="6.5" fill="#0f766e" stroke="#ffffff" stroke-width="2" style="filter: drop-shadow(0 0 5px rgba(15,118,110,0.9));" />
      <circle cx="14" cy="14" r="2.2" fill="#ffffff" />
    </svg>`;

  return L.divIcon({
    className: "rr-marker",
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function remainingMinutes(expiryTimestamp: string): number {
  return Math.max(0, parseUtc(expiryTimestamp).getTime() - Date.now()) / 60000;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Fit the map to all visible points without re-fitting on every parent render
// ---------------------------------------------------------------------------
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = useMemo(
    () => points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("|"),
    [points]
  );

  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Minimal custom zoom controls (bottom-left, floating white squares)
// ---------------------------------------------------------------------------
function ZoomControls() {
  const map = useMap();

  return (
    <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        aria-label="Zoom in"
        className="bg-white/90 hover:bg-white border border-stone-200/80 text-stone-700 shadow-xs w-8 h-8 rounded-lg flex items-center justify-center text-lg leading-none"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        aria-label="Zoom out"
        className="bg-white/90 hover:bg-white border border-stone-200/80 text-stone-700 shadow-xs w-8 h-8 rounded-lg flex items-center justify-center text-lg leading-none"
      >
        -
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating legend swatches
// ---------------------------------------------------------------------------
function LegendSwatch({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface RouteMapProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listings?: any[];
  selectedIds?: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waypoints?: any[];
  onSelectListing?: (id: number) => void;
  simulateLive?: boolean;
  onTelemetry?: (t: TelemetryState | null) => void;
}

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];
const OSRM_BASE = "https://router.project-osrm.org";

export default function RouteMap({
  listings = [],
  selectedIds = [],
  waypoints = [],
  onSelectListing,
  simulateLive = false,
  onTelemetry,
}: RouteMapProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const orderedWaypoints = useMemo(
    () => [...waypoints].sort((a, b) => a.order - b.order),
    [waypoints]
  );

  const boundsPoints: [number, number][] = useMemo(
    () => [
      ...listings.map((l) => [l.latitude, l.longitude] as [number, number]),
      ...orderedWaypoints.map((w) => [w.lat, w.lng] as [number, number]),
    ],
    [listings, orderedWaypoints]
  );

  // -------------------------------------------------------------------------
  // 1. Real street-level geometry via OSRM
  // -------------------------------------------------------------------------
  const [roadGeometry, setRoadGeometry] = useState<[number, number][]>([]);
  const [courierIndex, setCourierIndex] = useState(0);

  useEffect(() => {
    if (orderedWaypoints.length < 2) {
      setRoadGeometry([]);
      return;
    }

    const coordString = orderedWaypoints
      .map((w) => `${w.lng},${w.lat}`)
      .join(";");
    let cancelled = false;

    fetch(
      `${OSRM_BASE}/route/v1/driving/${coordString}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          setRoadGeometry(
            coords.map((c: [number, number]) => [c[1], c[0]] as [number, number])
          );
        } else {
          setRoadGeometry([]);
        }
      })
      .catch(() => {
        if (!cancelled) setRoadGeometry([]);
      });

    return () => {
      cancelled = true;
    };
  }, [orderedWaypoints]);

  // Cumulative segment distances along the fetched road geometry.
  const geometryMetrics = useMemo(() => {
    const segs: number[] = [];
    let totalKm = 0;
    for (let i = 0; i < roadGeometry.length - 1; i++) {
      const d = haversineKm(roadGeometry[i], roadGeometry[i + 1]);
      segs.push(d);
      totalKm += d;
    }
    return { segs, totalKm };
  }, [roadGeometry]);

  // -------------------------------------------------------------------------
  // 2. Live courier transit simulator (150ms steps along roadGeometry)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!simulateLive || roadGeometry.length < 2) return;
    setCourierIndex(0);
    const id = setInterval(() => {
      setCourierIndex((prev) => {
        const next = prev + 1;
        if (next >= roadGeometry.length - 1) {
          clearInterval(id);
          return roadGeometry.length - 1;
        }
        return next;
      });
    }, 150);
    return () => clearInterval(id);
  }, [simulateLive, roadGeometry]);

  useEffect(() => {
    if (!onTelemetry) return;
    if (!simulateLive || roadGeometry.length < 2) {
      onTelemetry(null);
      return;
    }
    let remaining = 0;
    for (let i = courierIndex; i < geometryMetrics.segs.length; i++) {
      remaining += geometryMetrics.segs[i];
    }
    onTelemetry({
      speedKmh: 34,
      segment: `Segment ${courierIndex + 1}/${geometryMetrics.segs.length}`,
      remainingKm: remaining,
    });
  }, [
    simulateLive,
    courierIndex,
    roadGeometry.length,
    geometryMetrics.segs,
    onTelemetry,
  ]);

  // Sequential step labels for pickups: 0 (start) -> 1..N -> END.
  let pickupStep = 0;

  return (
    <div className="h-[520px] w-full rounded-xl overflow-hidden border border-stone-200 relative bg-stone-100">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <FitBounds points={boundsPoints} />

        <TileLayer
          className="editorial-map-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomControls />

        {/* Donation listings (selected pill vs. unselected beacon) */}
        {listings.map((listing: FoodListing) => {
          const isSelected = selected.has(listing.id);

          return (
            <Marker
              key={`listing-${listing.id}`}
              position={[listing.latitude, listing.longitude]}
              icon={isSelected ? selectedDonorIcon() : donorIcon()}
              eventHandlers={{
                click: () => onSelectListing?.(listing.id),
              }}
            >
              <Popup>
                <div className="p-1 min-w-[210px]">
                  <p className="font-semibold text-stone-800">
                    {listing.title}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    {listing.food_type} • {listing.quantity_kg} kg
                  </p>
                  <p className="text-xs text-stone-500">
                    Target: {listing.target_temp_celsius}°C
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    {remainingMinutes(listing.expiry_timestamp).toFixed(0)}m to
                    expiry • {listing.latitude.toFixed(4)},{" "}
                    {listing.longitude.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Active route waypoints */}
        {orderedWaypoints.length > 0 &&
          orderedWaypoints.map((wp) => {
            let step: string;
            if (wp.type === "START") {
              step = "0";
            } else if (wp.type === "DROPOFF") {
              step = "END";
            } else {
              pickupStep += 1;
              step = String(pickupStep);
            }

            return (
              <Marker
                key={`wp-${wp.order}`}
                position={[wp.lat, wp.lng]}
                icon={waypointIcon(step)}
              >
                <Popup>
                  <div className="p-1 min-w-[180px]">
                    <p className="font-semibold text-stone-800">
                      {step} • {wp.label}
                    </p>
                    <p className="text-xs text-stone-500 mt-1">
                      {wp.type} • {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                    </p>
                    {wp.listing_id != null && (
                      <p className="text-xs text-stone-400 mt-1">
                        Listing #{wp.listing_id}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Route path: real street geometry when available, else direct line */}
        {roadGeometry.length >= 2 ? (
          <Polyline
            positions={roadGeometry}
            pathOptions={{ color: "#0f766e", weight: 4.5, opacity: 0.9 }}
          />
        ) : (
          orderedWaypoints.length > 1 && (
            <Polyline
              positions={orderedWaypoints.map(
                (w) => [w.lat, w.lng] as [number, number]
              )}
              pathOptions={{
                color: "#0f766e",
                weight: 3.5,
                opacity: 0.9,
                dashArray: "6, 6",
              }}
            />
          )
        )}

        {/* Live courier marker */}
        {simulateLive &&
          roadGeometry.length > 0 &&
          courierIndex < roadGeometry.length && (
            <Marker position={roadGeometry[courierIndex]} icon={courierIcon()} />
          )}
      </MapContainer>

      {/* Floating frosted-glass legend */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-md border border-stone-200/80 shadow-sm rounded-xl p-3 text-xs text-stone-600 pointer-events-auto">
        <div className="flex items-center justify-between gap-6 mb-2">
          <span className="text-[10px] tracking-widest text-stone-500 font-medium">
            LEGEND
          </span>
          <span className="text-[10px] tracking-widest text-stone-400">
            GPS LOCK
          </span>
        </div>

        <div className="space-y-1.5">
          <LegendSwatch
            label="Selected Donor"
            swatch={
              <span className="h-3 w-3 rounded-full border-2 border-[#0f766e] bg-white" />
            }
          />
          <LegendSwatch
            label="Donor"
            swatch={<span className="h-3 w-3 rounded-full bg-[#ea580c]" />}
          />
          <LegendSwatch
            label="Route Waypoint"
            swatch={<span className="h-3 w-3 rounded-[4px] bg-[#18181b]" />}
          />
          <LegendSwatch
            label="Route Path"
            swatch={<span className="h-0.5 w-5 rounded-full bg-[#0f766e]" />}
          />
        </div>

        <div className="mt-2 pt-2 border-t border-stone-200/80 flex items-center justify-between text-[10px] text-stone-500">
          <span>ACTIVE WAYPOINTS</span>
          <span className="font-semibold text-stone-800">
            {orderedWaypoints.length}
          </span>
        </div>
      </div>
    </div>
  );
}
