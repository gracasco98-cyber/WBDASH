"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ClipboardList, Euro, LayoutDashboard, Plus, Truck } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
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

  const kpis = [
    { label: "Ordini in corso", icon: ClipboardList, cls: "text-slate-900", value: summary ? String(summary.ordersInProgress) : "—" },
    { label: "Valore ordini in corso", icon: Euro, cls: "text-emerald-700", value: summary ? formatEUR(summary.valueInProgress) : "—" },
    { label: "Fornitori attivi", icon: Truck, cls: "text-slate-900", value: summary ? String(summary.activeSuppliers) : "—" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-5">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <LayoutDashboard size={20} className="text-emerald-600" />
                  <h1 className="text-2xl font-bold tracking-tight">Gestionale — Panoramica</h1>
                  <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">Ordini fornitore, valore impegnato e fornitori attivi a colpo d'occhio</p>
              </div>
              <Link
                href="/acquisti/ordini/nuovo"
                className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 w-fit"
              >
                <Plus size={15} /> Nuovo ordine
              </Link>
            </header>

            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpis.map(({ label, icon: Icon, cls, value }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>{label}</span>
                    <Icon size={15} className={cls} />
                  </div>
                  <div className={`mt-2 text-lg font-bold tabular-nums ${loading ? "text-slate-300" : cls}`}>{value}</div>
                </div>
              ))}
              <ComingSoonKpiTile label="Magazzino" note="Arriva con FASE F" />
              <ComingSoonKpiTile label="Fatture da riconciliare" note="Arriva con FASE G" />
            </section>

            {summary && (
              <>
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StatusBreakdownChart data={summary.statusBreakdown} />
                  <TopSuppliersChart data={summary.topSuppliers} />
                </section>
                <OrdersOverTimeChart data={summary.ordersOverTime} />
                <RecentOrdersTable orders={summary.recentOrders} />
              </>
            )}

            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3">Aree di lavoro</h2>
              <WorkAreasHub />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
