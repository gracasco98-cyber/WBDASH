"use client";
import { ProductKpis } from "@/lib/api";
import KpiCard from "@/components/dashboard/KpiCard";
import { Package, TrendingUp, RotateCcw, Megaphone, Tag } from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";

export default function ProductKpiCards({ kpis, loading }: { kpis: ProductKpis | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      <KpiCard
        label="Fatturato lordo"
        value={kpis ? fmtEur(kpis.totalGross) : "—"}
        sub={kpis ? `${kpis.productCount} prodotti` : ""}
        icon={<TrendingUp size={14} />}
        accent="green"
        loading={loading}
      />
      <KpiCard
        label="Fatturato netto"
        value={kpis ? fmtEur(kpis.totalNet) : "—"}
        sub={kpis ? `Ads: ${fmtEur(kpis.totalAdSpend)}` : ""}
        icon={<Tag size={14} />}
        accent="blue"
        loading={loading}
      />
      <KpiCard
        label="Unità vendute"
        value={kpis ? fmtNum(kpis.totalUnits) : "—"}
        sub="Quantità totale"
        icon={<Package size={14} />}
        accent="purple"
        loading={loading}
      />
      <KpiCard
        label="Rimborsi"
        value={kpis ? fmtEur(kpis.totalRefunds) : "—"}
        sub={kpis && kpis.totalRefunds > 0 ? "⚠ verifica prodotti" : "Tutto ok"}
        icon={<RotateCcw size={14} />}
        accent={kpis && kpis.totalRefunds > 0 ? "red" : "green"}
        loading={loading}
      />
      <KpiCard
        label="Marketplace Ads"
        value={kpis ? fmtEur(kpis.totalAdSpend) : "—"}
        sub={kpis ? `${kpis.productCount} prodotti con vendite` : ""}
        icon={<Megaphone size={14} />}
        accent="amber"
        loading={loading}
      />
    </div>
  );
}
