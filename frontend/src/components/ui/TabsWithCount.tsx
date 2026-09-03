export interface TabItem {
  id: string;
  label: string;
  count: number;
}

interface Props {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export default function TabsWithCount({ tabs, activeId, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map(tab => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              active ? "text-emerald-700 border-emerald-600" : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            {tab.label}
            <span className={`text-[9.5px] rounded px-1.5 py-0.5 ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
