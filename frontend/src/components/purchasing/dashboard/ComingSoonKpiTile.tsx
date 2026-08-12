interface Props { label: string; note: string }

export default function ComingSoonKpiTile({ label, note }: Props) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3 sm:p-4 opacity-60">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-zinc-500">{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-zinc-700 border border-zinc-800 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-zinc-700">—</div>
      <div className="text-xs text-zinc-600 mt-1">{note}</div>
    </div>
  );
}
