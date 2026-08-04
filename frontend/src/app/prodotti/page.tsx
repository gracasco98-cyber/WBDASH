"use client";
import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import AmazonAccountGuard from "@/components/amazon/AmazonAccountGuard";
import PeriodTiles from "@/components/products/PeriodTiles";
import ProductsPerformanceTable, { GroupBy } from "@/components/products/ProductsPerformanceTable";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { getDateRangeForPreset } from "@/lib/periodUtils";
import { api } from "@/lib/api";
import type { ProductPerformanceGroup } from "@/lib/api";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";

function ProdottiContent() {
  const { state } = usePeriodFilter();
  const { marketplace: globalMarketplace } = useMarketplaceFilter();
  const marketplace = isAmazonChannel(globalMarketplace) ? amazonChannelCode(globalMarketplace)! : "all";

  // `state.from`/`state.to` are only populated for the "custom" preset
  // (see PeriodContext.setPreset, which clears them) — for every other
  // preset we resolve concrete dates via the same shared helper the main
  // dashboard uses (frontend/src/app/page.tsx), so e.g. "yesterday" maps
  // to yesterday's date instead of falling back to today's.
  const presetRange = state.preset !== "custom" ? getDateRangeForPreset(state.preset) : null;
  const from = presetRange?.from || state.from;
  const to = presetRange?.to || state.to;

  const [groups, setGroups] = useState<ProductPerformanceGroup[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("marketplace");

  const load = useCallback(async () => {
    try {
      const { groups: fetchedGroups } = await api.productPerformance.get({ marketplace, from, to });
      setGroups(fetchedGroups);
    } catch (error) {
      console.error("[ProdottiPage] Failed to load product performance:", error);
    }
  }, [marketplace, from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
      <h1 className="text-lg sm:text-xl font-bold text-white">Prodotti</h1>
      <PeriodTiles />
      <ProductsPerformanceTable
        groups={groups}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onRenamed={load}
        onMoved={load}
      />
    </main>
  );
}

export default function ProdottiPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <AmazonAccountGuard>
            <ProdottiContent />
          </AmazonAccountGuard>
        </div>
      </div>
    </div>
  );
}
