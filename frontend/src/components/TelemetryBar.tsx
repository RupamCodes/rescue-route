"use client";

import { Leaf, AlertTriangle, Zap, Gauge } from "lucide-react";

interface TelemetryBarProps {
  totalKg: number;
  urgentCount: number;
}

export default function TelemetryBar({ totalKg = 0, urgentCount = 0 }: TelemetryBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div className="bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="h-4 w-4 text-indigo-400" />
          <span className="text-xs text-zinc-400 font-medium">TOTAL RESCUABLE</span>
        </div>
        <div className="text-2xl font-bold text-zinc-100 font-mono">{totalKg.toFixed(1)} kg</div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <Leaf className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-zinc-400 font-medium">EST. CARBON OFFSET</span>
        </div>
        <div className="text-2xl font-bold text-emerald-400 font-mono">{totalKg > 0 ? `${(totalKg * 2.5).toFixed(1)} kg CO₂e` : "—"}</div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          <span className="text-xs text-zinc-400 font-medium">URGENT WINDOWS</span>
        </div>
        <div className="text-2xl font-bold text-rose-400 font-mono">{urgentCount} active</div>
      </div>

      <div className="bg-zinc-900/80 border border-emerald-500/20 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span className="text-xs text-zinc-400 font-medium">SYSTEM STATUS</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Logistics Core: Online
        </div>
      </div>
    </div>
  );
}