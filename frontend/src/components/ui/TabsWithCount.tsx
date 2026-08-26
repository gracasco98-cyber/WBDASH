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
    <div className="flex gap-1 border-b border-bg-border">
      {tabs.map(tab => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              active ? "text-accent-primary border-accent-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {tab.label}
            <span className={`text-[9.5px] rounded px-1.5 py-0.5 ${active ? "bg-accent-primary/10 text-accent-primary" : "bg-bg-hover text-zinc-500"}`}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
