"use client";
import { useState, useEffect } from "react";
import { ClipboardList, Euro, Truck } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import KpiCard from "@/components/dashboard/KpiCard";
import ComingSoonKpiTile from "@/components/purchasing/dashboard/ComingSoonKpiTile";
import StatusBreakdownChart from "@/components/purchasing/dashboard/StatusBreakdownChart";
import OrdersOverTimeChart from "@/components/purchasing/dashboard/OrdersOverTimeChart";
import TopSuppliersChart from "@/components/purchasing/dashboard/TopSuppliersChart";
import RecentOrdersTable from "@/components/purchasing/dashboard/RecentOrdersTable";
import WorkAreasHub from "@/components/purchasing/dashboard/WorkAreasHub";
import { api } from "@/lib/api";
import { formatEUR } from "@/lib/marketplaces";
import type { DashboardSummary } from "@/lib/api/acquisti-dashboard";

export default function AcquistiDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.acquistiDashboard.get().then(setSummary).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-6">
            <h1 className="text-lg sm:text-xl font-bold text-white">Amministrazione — Panoramica</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Ordini in corso" icon={<ClipboardList size={14} />} accent="green" loading={loading}
                value={summary ? String(summary.ordersInProgress) : "—"}
              />
              <KpiCard
                label="Valore ordini in corso" icon={<Euro size={14} />} accent="blue" loading={loading}
                value={summary ? formatEUR(summary.valueInProgress) : "—"}
              />
              <KpiCard
                label="Fornitori attivi" icon={<Truck size={14} />} accent="purple" loading={loading}
                value={summary ? String(summary.activeSuppliers) : "—"}
              />
              <ComingSoonKpiTile label="Magazzino" note="Arriva con FASE F" />
              <ComingSoonKpiTile label="Fatture da riconciliare" note="Arriva con FASE G" />
            </div>

            {summary && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StatusBreakdownChart data={summary.statusBreakdown} />
                  <TopSuppliersChart data={summary.topSuppliers} />
                </div>
                <OrdersOverTimeChart data={summary.ordersOverTime} />
                <RecentOrdersTable orders={summary.recentOrders} />
              </>
            )}

            <div>
              <h2 className="text-sm font-semibold text-white mb-3">Aree di lavoro</h2>
              <WorkAreasHub />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
