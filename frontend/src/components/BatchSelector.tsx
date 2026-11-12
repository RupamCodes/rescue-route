export function InlineUrgencyBadge({ expiryTimestamp }: { expiryTimestamp: string; urgencyScore: number }) {
  const remainingMins = Math.max(0, Math.ceil(new Date(expiryTimestamp).getTime() - Date.now()) / 60000);

  if (remainingMins < 45) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse text-[11px] font-mono">
        <span className="h-2 w-2 bg-rose-400 rounded-full animate-pulse"></span>
        {remainingMins}m
      </span>
    );
  }
  if (remainingMins < 180) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-mono">
        <span className="h-2 w-2 bg-amber-400 rounded-full"></span>
        {remainingMins}m
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono">
      <span className="h-2 w-2 bg-emerald-400 rounded-full"></span>
      {remainingMins}m
    </span>
  );
}

export function TelemetryBar({ totalKg = 0, urgentCount = 0 }: { totalKg?: number; urgentCount?: number }) {
  void totalKg;
  void urgentCount;
  return null;
}

export function BatchSelector() {
  return null;
}