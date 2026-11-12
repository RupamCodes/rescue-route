"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flame } from "lucide-react";
import { parseUtc } from "@/lib/api";

interface UrgencyBadgeProps {
  expiryTimestamp: string;
  urgencyScore: number;
}

function remainingMinutes(expiryTimestamp: string): number {
  const ms = parseUtc(expiryTimestamp).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 60000));
}

export default function UrgencyBadge({
  expiryTimestamp,
  urgencyScore,
}: UrgencyBadgeProps) {
  const [mins, setMins] = useState(() => remainingMinutes(expiryTimestamp));

  useEffect(() => {
    const tick = () => setMins(remainingMinutes(expiryTimestamp));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [expiryTimestamp]);

  const score = Math.max(0, urgencyScore);

  if (mins <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200/80">
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
        Expired
      </span>
    );
  }

  if (mins < 45) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/90 shadow-sm">
        <Flame className="w-3.5 h-3.5" strokeWidth={1.75} />
        {mins}m left • {score.toFixed(0)} pts
      </span>
    );
  }

  if (mins < 180) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50/80 text-amber-800 border border-amber-200/80">
        <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
        {mins}m left • {score.toFixed(0)} pts
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50/80 text-emerald-800 border border-emerald-200/80">
      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
      {Math.round(mins / 60)}h {mins % 60}m • {score.toFixed(0)} pts
    </span>
  );
}
