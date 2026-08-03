"use client";
import { useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import CrossChannelProducts from "@/components/dashboard/CrossChannelProducts";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import AmazonAccountGuard from "@/components/amazon/AmazonAccountGuard";

type Period = "today" | "yesterday" | "last7" | "last30" | "last90" | "month";

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "today",     label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7",     label: "Ultimi 7gg" },
  { value: "last30",    label: "Ultimi 30gg" },
  { value: "last90",    label: "Ultimi 90gg" },
  { value: "month",     label: "Mese corrente" },
];

export default function ProdottiPage() {
  const { marketplace } = useMarketplaceFilter();
  const [period, setPeriod] = useState<Period>("last30");

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h1 className="text-lg sm:text-xl font-bold text-white">Prodotti</h1>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPeriod(opt.value)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                      period === opt.value
                        ? "bg-accent-primary/15 border-accent-primary/40 text-accent-primary"
                        : "bg-bg-base border-bg-border text-zinc-500 hover:text-white hover:border-zinc-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <AmazonAccountGuard>
              <CrossChannelProducts filter={period} from="" to="" marketplace={marketplace} />
            </AmazonAccountGuard>
          </main>
        </div>
      </div>
    </div>
  );
}
