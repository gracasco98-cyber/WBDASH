export interface StatTileProps {
  value: number | string;
  label: string;
  tone?: "primary" | "neutral" | "amber";
}

const TONE_CLASSES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  primary: "text-emerald-700",
  neutral: "text-slate-700",
  amber: "text-amber-700",
};

export function StatTile({ value, label, tone = "neutral" }: StatTileProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm">
      <div className={`text-base font-bold ${TONE_CLASSES[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export function StatTileRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{children}</div>;
}
