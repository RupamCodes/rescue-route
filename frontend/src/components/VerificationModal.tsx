"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  QrCode,
  Thermometer,
  X,
} from "lucide-react";
import { verifyDropoff, verifyPickup } from "@/lib/api";

type Mode = "PICKUP" | "DROPOFF";

interface VerificationModalProps {
  mode: Mode;
  missionId: number;
  code: string;
  onSuccess: () => void;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full bg-[#FAF9F6] border border-stone-200/90 rounded-xl px-3.5 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600";

export default function VerificationModal({
  mode,
  missionId,
  code,
  onSuccess,
  onClose,
}: VerificationModalProps) {
  const [codeValue, setCodeValue] = useState(code.toUpperCase());
  const [temp, setTemp] = useState<string>("4");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the code remains visible for manual entry.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "PICKUP") {
        const value = Number(temp);
        if (temp === "" || Number.isNaN(value)) {
          setError("Measured temperature is required");
          setLoading(false);
          return;
        }
        await verifyPickup(missionId, codeValue.toUpperCase().trim(), value);
      } else {
        await verifyDropoff(missionId, codeValue.toUpperCase().trim());
      }
      setSuccess(
        mode === "PICKUP"
          ? "Pickup verified and temperature logged."
          : "Dropoff handshake complete."
      );
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-stone-900/30 backdrop-blur-sm px-4">
      <div className="bg-white border border-stone-200/90 text-stone-900 rounded-2xl shadow-xl p-6 max-w-md w-full">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-50 border border-teal-200/60 flex items-center justify-center">
              <QrCode className="h-5 w-5 text-teal-700" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                {mode === "PICKUP"
                  ? "Verify Pickup & Safe Temp"
                  : "Complete Shelter Handshake"}
              </h2>
              <p className="text-xs text-stone-400">
                Mission #{missionId}
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
          {/* Handshake code */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5">
              {mode === "PICKUP" ? "Pickup Code" : "Dropoff Code"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                className={`${INPUT_CLASS} uppercase tracking-wider font-mono`}
                maxLength={6}
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={copyCode}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200/90 text-stone-600 hover:bg-stone-50 text-xs font-medium flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-teal-700" strokeWidth={2} />
                    Copied
                  </>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
          </div>

          {/* Temperature (pickup only) */}
          {mode === "PICKUP" && (
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1.5 flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                Measured Temperature (°C)
              </label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setTemp("4")}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    temp === "4"
                      ? "bg-teal-50 border-teal-300/60 text-teal-700"
                      : "bg-white border-stone-200/80 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  Safe Cold (4°C)
                </button>
                <button
                  type="button"
                  onClick={() => setTemp("25")}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    temp === "25"
                      ? "bg-orange-50 border-orange-300/60 text-orange-700"
                      : "bg-white border-stone-200/80 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  Danger Zone (25°C)
                </button>
              </div>
              <input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                className={INPUT_CLASS}
                required
              />
              <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
                <AlertCircle
                  className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-0.5"
                  strokeWidth={1.75}
                />
                Perishable cooked food must be at or below 5°C, or at or above
                60°C. Readings inside 5°C–60°C are rejected.
              </p>
            </div>
          )}

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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : null}
            {loading
              ? "Verifying…"
              : mode === "PICKUP"
                ? "Confirm Pickup"
                : "Confirm Dropoff"}
          </button>
        </form>
      </div>
    </div>
  );
}
