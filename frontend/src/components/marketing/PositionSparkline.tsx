// PositionSparkline.tsx — compact inline position-history trend line for a
// single tracked keyword, used in the Keyword Tracker table (Helium10-style
// density: a trend at a glance next to the current position, no separate
// click-to-expand chart needed for that).
import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";
import type { MarketingKeywordSnapshot } from "@/lib/api";

export function PositionSparkline({ snapshots }: { snapshots: MarketingKeywordSnapshot[] }) {
  const points = snapshots
    .filter((s): s is MarketingKeywordSnapshot & { position: number } => s.position !== null)
    .map((s) => ({ position: s.position }));

  if (points.length < 2) {
    return <span className="text-zinc-700 text-[11px]">—</span>;
  }

  return (
    <div style={{ width: 64, height: 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          {/* reversed: a lower position (better rank) sits higher on the line */}
          <YAxis reversed hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="position" stroke="#6ee7b7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
