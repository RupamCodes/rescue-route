"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Thermometer,
  Weight,
  X,
} from "lucide-react";
import { createListing } from "@/lib/api";

// ---------------------------------------------------------------------------
// Static configuration
// ---------------------------------------------------------------------------
const FOOD_TYPES = [
  { value: "PERISHABLE_COOKED", label: "Cooked Meal" },
  { value: "RAW_PRODUCE", label: "Fresh Produce" },
  { value: "BAKERY", label: "Artisan Bakery" },
  { value: "PACKAGED", label: "Packaged / Dry" },
] as const;

const TEMP_PRESETS = [
  { label: "Hot Hold", temp: 65 },
  { label: "Cold Chain", temp: 4 },
  { label: "Ambient", temp: 22 },
] as const;

// Each location preset maps to an existing seeded DONOR user so the backend
// `create_listing` FK is always satisfied during local demo runs.
const LOCATION_PRESETS = [
  { label: "Indiranagar", lat: 12.9784, lng: 77.6408, donorId: 4 },
  { label: "Koramangala", lat: 12.9352, lng: 77.6245, donorId: 6 },
  { label: "MG Road", lat: 12.9716, lng: 77.5946, donorId: 4 },
  { label: "Whitefield", lat: 12.9698, lng: 77.6502, donorId: 5 },
] as const;

// Live urgency preview matches the backend's decaying-exponential model.
function urgencyScore(mins: number): number {
  return 100 * Math.exp(-0.0035 * mins);
}

function urgencyTone(score: number): {
  text: string;
  bar: string;
  label: string;
} {
  if (score >= 70)
    return { text: "text-rose-600", bar: "bg-rose-500", label: "CRITICAL" };
  if (score >= 40)
    return { text: "text-amber-600", bar: "bg-amber-500", label: "URGENT" };
  return { text: "text-emerald-600", bar: "bg-emerald-500", label: "STABLE" };
}

const INPUT_CLASS =
  "w-full bg-[#FAF9F6] border border-stone-200/90 rounded-xl px-3.5 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface DonateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function DonateModal({
  open,
  onClose,
  onCreated,
}: DonateModalProps) {
  const [title, setTitle] = useState("Wedding Banquet Biryani Surplus");
  const [foodType, setFoodType] = useState<string>("PERISHABLE_COOKED");
  const [quantityKg, setQuantityKg] = useState(20);
  const [expiryMins, setExpiryMins] = useState(90);
  const [targetTemp, setTargetTemp] = useState(65);
  const [locationIndex, setLocationIndex] = useState(0);
  const [dietaryNotes, setDietaryNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const location = LOCATION_PRESETS[locationIndex];
  const score = urgencyScore(expiryMins);
  const tone = urgencyTone(score);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const now = new Date();
    const payload = {
      donor_id: location.donorId,
      title: title.trim(),
      food_type: foodType,
      quantity_kg: quantityKg,
      prepared_at: now.toISOString(),
      expiry_timestamp: new Date(
        now.getTime() + expiryMins * 60_000
      ).toISOString(),
      target_temp_celsius: targetTemp,
      dietary_notes: dietaryNotes.trim() || "None",
      latitude: location.lat,
      longitude: location.lng,
    };

    try {
      await createListing(payload);
      setSuccess("Donation listed. The dashboard has been refreshed.");
      setTimeout(() => {
        setSuccess("");
        onCreated();
        onClose();
      }, 900);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-stone-900/30 backdrop-blur-sm p-4">
      <div className="bg-white border border-stone-200/90 text-stone-900 rounded-2xl shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-50 border border-teal-200/60 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-teal-700" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                Donate Surplus Food
              </h2>
              <p className="text-xs text-stone-400">
                Add a live donation to test the logistics engine.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wedding Banquet Biryani Surplus"
              maxLength={160}
              required
              className={INPUT_CLASS}
            />
          </div>

          {/* Food type */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5">
              Food Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FOOD_TYPES.map((ft) => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setFoodType(ft.value)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    foodType === ft.value
                      ? "border-teal-600/70 bg-teal-50 text-teal-700 font-medium"
                      : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-stone-600 flex items-center gap-1.5">
                <Weight className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                Quantity
              </label>
              <span className="text-sm font-mono text-teal-700 font-semibold">
                {quantityKg} kg
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={45}
              step={1}
              value={quantityKg}
              onChange={(e) => setQuantityKg(Number(e.target.value))}
              className="w-full accent-teal-700"
            />
            <div className="flex justify-between text-[10px] text-stone-400 font-mono mt-1">
              <span>1 kg</span>
              <span>45 kg</span>
            </div>
          </div>

          {/* Expiry window */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-stone-600 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                Expiry Window
              </label>
              <span className="text-sm font-mono text-stone-800">
                {expiryMins} min
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={480}
              step={5}
              value={expiryMins}
              onChange={(e) => setExpiryMins(Number(e.target.value))}
              className="w-full accent-teal-700"
            />
            <div className="flex justify-between text-[10px] text-stone-400 font-mono mt-1">
              <span>15m</span>
              <span>480m</span>
            </div>

            {/* Live urgency preview */}
            <div className="mt-3 p-3 rounded-xl bg-[#FAF9F6] border border-stone-200/60">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-stone-500">Urgency Score</span>
                <span className={`text-sm font-mono font-bold ${tone.text}`}>
                  {score.toFixed(1)} • {tone.label}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-stone-200/70 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
                  style={{ width: `${Math.min(100, score)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Target storage temp */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5 flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
              Target Storage Temp (°C)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {TEMP_PRESETS.map((preset) => {
                const active = targetTemp === preset.temp;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setTargetTemp(preset.temp)}
                    className={`px-2 py-2 rounded-lg border text-xs transition-colors ${
                      active
                        ? "border-teal-600/70 bg-teal-50 text-teal-700 font-medium"
                        : "border-stone-200/80 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {preset.label}
                    <span className="block text-[10px] text-stone-400 font-mono">
                      {preset.temp}°C
                    </span>
                  </button>
                );
              })}
            </div>
            <input
              type="number"
              step="0.5"
              value={targetTemp}
              onChange={(e) => setTargetTemp(Number(e.target.value))}
              className={INPUT_CLASS}
            />
          </div>

          {/* Location preset */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
              Pickup Location
            </label>
            <select
              value={locationIndex}
              onChange={(e) => setLocationIndex(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              {LOCATION_PRESETS.map((loc, i) => (
                <option key={loc.label} value={i}>
                  {loc.label} ({loc.lat.toFixed(4)}, {loc.lng.toFixed(4)})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-stone-400 font-mono">
              {location.lat.toFixed(4)}, {location.lng.toFixed(4)} • donor #
              {location.donorId}
            </p>
          </div>

          {/* Dietary notes */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5">
              Dietary Notes{" "}
              <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              placeholder="e.g. Vegetarian, contains dairy"
              maxLength={255}
              className={INPUT_CLASS}
            />
          </div>

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200/80 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
          >
            {submitting ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : null}
            {submitting ? "Publishing…" : "Publish Donation"}
          </button>
        </form>
      </div>
    </div>
  );
}
