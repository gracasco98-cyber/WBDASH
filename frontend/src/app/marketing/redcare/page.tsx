"use client";
import { useState } from "react";
import { Brain, LineChart } from "lucide-react";
import RedcareKeywordSearch from "@/components/marketing/RedcareKeywordSearch";
import RedcareAddKeywordForm from "@/components/marketing/RedcareAddKeywordForm";
import RedcareTrackedKeywords from "@/components/marketing/RedcareTrackedKeywords";

type Tab = "cerebro" | "tracker";

const TABS: { value: Tab; label: string; Icon: typeof Brain }[] = [
  { value: "cerebro", label: "Cerebro — Ricerca Keyword", Icon: Brain },
  { value: "tracker", label: "Keyword Tracker", Icon: LineChart },
];

export default function RedcareKeywordBiPage() {
  const [tab, setTab] = useState<Tab>("cerebro");
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Redcare — Keyword BI</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Posizione organica per keyword su redcare.it / shop-apotheke.com, con storico per i tuoi prodotti e i competitor che tracci.
        </p>
      </div>

      <div className="flex items-center gap-0.5 border-b border-bg-border pb-px">
        {TABS.map(({ value, label, Icon }) => {
          const isActive = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={[
                "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium",
                "rounded-t-lg transition-colors duration-150 focus:outline-none select-none whitespace-nowrap",
                isActive
                  ? "text-accent-primary bg-accent-primary/10 border border-b-0 border-accent-primary/20"
                  : "text-zinc-500 hover:text-white hover:bg-bg-hover border border-b-0 border-transparent",
              ].join(" ")}
            >
              <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "cerebro" ? (
        <RedcareKeywordSearch onTracked={bumpRefresh} />
      ) : (
        <>
          <RedcareAddKeywordForm onAdded={bumpRefresh} />
          <RedcareTrackedKeywords refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}
