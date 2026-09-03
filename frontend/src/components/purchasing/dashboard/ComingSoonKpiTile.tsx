interface Props { label: string; note: string }

export default function ComingSoonKpiTile({ label, note }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm opacity-70">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-slate-300">—</div>
      <div className="text-xs text-slate-400 mt-1">{note}</div>
    </div>
  );
}
