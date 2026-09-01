"use client";

import { LayoutGrid } from "lucide-react";

// "chart" | "pl" | "trends" removed from the tab bar for now (unused/unfinished
// views) — kept in the union so page.tsx's existing render branches for them
// don't need to change; they're just unreachable until a tab is added back.
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
  { value: "tiles", label: "Panoramica", Icon: LayoutGrid },
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
                : "text-zinc-500 hover:text-white hover:bg-bg-hover border border-transparent",
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
