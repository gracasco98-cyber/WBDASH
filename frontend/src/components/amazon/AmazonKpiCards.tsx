"use client";
import { AmazonSummary } from "@/lib/api";
import { ShoppingCart, Package, TrendingUp, DollarSign, Target, Wallet } from "lucide-react";
import { fmtEur } from "@/lib/fmt";

interface Props {
  summary: AmazonSummary | null;
  loading: boolean;
}

function KpiCard({
  label, value, sub, icon: Icon, accent, loading,
}: {
  label: string; value: string; sub?: string; icon: any; accent: string; loading: boolean;
}) {
  const accentMap: Record<string, { border: string; glow: string; text: string; bg: string }> = {
    green:  { border: "border-accent-primary/20",  glow: "bg-accent-primary/5",  text: "text-accent-primary",  bg: "from-accent-primary/10" },
    blue:   { border: "border-accent-blue/20",     glow: "bg-accent-blue/5",     text: "text-accent-blue",     bg: "from-accent-blue/10"    },
    purple: { border: "border-accent-purple/20",   glow: "bg-accent-purple/5",   text: "text-accent-purple",   bg: "from-accent-purple/10"  },
    amber:  { border: "border-accent-amber/20",    glow: "bg-accent-amber/5",    text: "text-accent-amber",    bg: "from-accent-amber/10"   },
    red:    { border: "border-accent-red/20",      glow: "bg-accent-red/5",      text: "text-accent-red",      bg: "from-accent-red/10"     },
  };
  const c = accentMap[accent] ?? accentMap.green;

  return (
    <div className={`relative bg-bg-card border ${c.border} rounded-xl p-3 sm:p-4 overflow-hidden card-hover transition-all`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${c.bg} to-transparent pointer-events-none`} />
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl ${c.glow} pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase">{label}</span>
          <div className={`w-7 h-7 rounded-lg ${c.glow} border ${c.border} flex items-center justify-center`}>
            <Icon size={14} className={c.text} />
          </div>
        </div>
        {loading ? (
          <div className="h-7 w-28 bg-bg-border rounded animate-pulse mb-1" />
        ) : (
          <div className={`text-lg sm:text-xl font-semibold ${c.text} tabular-nums`}>{value}</div>
        )}
        {sub && !loading && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function AmazonKpiCards({ summary, loading }: Props) {
  const acosColor = (summary?.acos ?? 0) > 30 ? "red" : "green";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      <KpiCard
        label="Fatturato Lordo"
        value={summary ? fmtEur(summary.totalRevenue) : "—"}
        icon={TrendingUp}
        accent="blue"
        loading={loading}
      />
      <KpiCard
        label="Ordini"
        value={summary ? String(summary.orderCount) : "—"}
        icon={ShoppingCart}
        accent="purple"
        loading={loading}
      />
      <KpiCard
        label="Unità Vendute"
        value={summary ? String(summary.unitsSold) : "—"}
        icon={Package}
        accent="green"
        loading={loading}
      />
      <KpiCard
        label="Ad Spend"
        value={summary ? fmtEur(summary.adSpend) : "—"}
        sub={summary?.adSpend === 0 ? "Nessun dato PPC" : undefined}
        icon={DollarSign}
        accent="amber"
        loading={loading}
      />
      <KpiCard
        label="ACOS"
        value={summary ? `${summary.acos.toFixed(1)}%` : "—"}
        sub={summary?.adSpend === 0 ? "Nessun dato PPC" : undefined}
        icon={Target}
        accent={acosColor}
        loading={loading}
      />
      <KpiCard
        label="Payout Stimato"
        value={summary ? fmtEur(summary.estimatedPayout) : "—"}
        sub="Fatturato − Ad Spend"
        icon={Wallet}
        accent="green"
        loading={loading}
      />
    </div>
  );
}
