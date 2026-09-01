"use client";

import { BarChart3, LayoutGrid, LineChart, TrendingUp } from "lucide-react";

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
  { value: "tiles",  label: "Panoramica", Icon: LayoutGrid },
  { value: "chart",  label: "Grafici", Icon: BarChart3 },
  { value: "pl",     label: "P&L", Icon: LineChart },
  { value: "trends", label: "Trend", Icon: TrendingUp },
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
                ? "text-accent-primary bg-accent-primary/10 border border-accent-primary/20"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-bg-hover border border-transparent",
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
