import { Search } from "lucide-react";

interface Props {
  title: string;
  summary?: string;
  subtitle?: string;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  actions?: React.ReactNode;
}

export default function PageHeader({ title, summary, subtitle, search, actions }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h1>
          {summary && (
            <span className="text-[10.5px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5 shadow-sm">
              {summary}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-1 max-w-lg">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {search && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? "Cerca..."}
              className="bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400 w-44"
            />
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
