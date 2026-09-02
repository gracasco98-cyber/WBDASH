// PositionBadge.tsx — shared position-tier badge for both the live search
// table (RedcareKeywordSearch) and the tracked-products view
// (RedcareTrackedKeywords), so a "#3" reads the same color everywhere.
export function PositionBadge({ position }: { position: number | null }) {
  if (position === null) {
    return <span className="text-zinc-600 text-xs">—</span>;
  }
  const tier = position <= 5 ? "good" : position <= 20 ? "mid" : "bad";
  const cls =
    tier === "good"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : tier === "mid"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-semibold tabular-nums ${cls}`}>
      #{position}
    </span>
  );
}
