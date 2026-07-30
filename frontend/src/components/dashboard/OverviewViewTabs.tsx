"use client";

import { LayoutGrid, TrendingUp, BarChart2, Activity } from "lucide-react";

export type DashboardView = "tiles" | "chart" | "pl" | "trends";

interface Props {
  activeView: DashboardView;
  onChange: (v: DashboardView) => void;
}

interface TabDef {
  value: DashboardView;
  label: string;
  Icon: React.ElementType;
}

const TABS: TabDef[] = [
  { value: "tiles",  label: "Tiles",  Icon: LayoutGrid },
  { value: "chart",  label: "Chart",  Icon: TrendingUp  },
  { value: "pl",     label: "P&L",    Icon: BarChart2   },
  { value: "trends", label: "Trends", Icon: Activity    },
];

export default function OverviewViewTabs({ activeView, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {TABS.map(({ value, label, Icon }) => {
        const isActive = activeView === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={[
              "relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium",
              "rounded-lg transition-colors duration-150 focus:outline-none select-none whitespace-nowrap",
              isActive
                ? "text-white bg-white/10"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]",
            ].join(" ")}
          >
            <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="hidden xs:inline sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
