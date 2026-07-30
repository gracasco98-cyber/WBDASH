"use client";
import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Brain, Target,
  Zap, DollarSign, Package, ChevronDown, ChevronUp, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, Info,
} from "lucide-react";
import { fmtEur, fmtNum, fmtPct } from "@/lib/fmt";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface ForecastItem {
  asin: string; title: string; velocity: number; trendPctPerMonth: number;
  trendDirection: "up" | "down" | "flat"; forecast14Total: number;
  reorderQty: number; forecast14: { day: string; units: number }[];
}
interface ForecastData { items: ForecastItem[]; generatedAt: string }

interface AnomalyItem {
  asin: string; title: string; z: number; severity: "high" | "medium" | "low";
  direction: "spike" | "drop"; avg7: number; mean30: number; std30: number;
  pctChange: number; marketplace: string;
}
interface AnomalyData { anomalies: AnomalyItem[]; stable: any[]; totalAnalyzed: number; generatedAt: string }

interface PpcCampaign {
  campaignId: string; campaignName: string; campaignType: string;
  impressions: number; clicks: number; spend: number; sales: number;
  orders: number; acos: number | null; roas: number | null;
  tier: "excellent" | "good" | "marginal" | "poor" | "no_sales";
  budgetDelta: number; recommendation: string;
}
interface PpcData {
  summary: {
    overallAcos: number; overallRoas: number; totalSpend: number; totalSales: number;
    savingOpportunity: number; reallocationSuggestion: number;
    campaignsByTier: Record<string, number>;
  };
  campaigns: PpcCampaign[]; generatedAt: string;
}

interface MarginProduct {
  asin: string; title: string; marketplace: string;
  grossRevenue: number; unitsSold: number; avgRevPerUnit: number;
  cogs: number; referralFee: number; fbaFee: number;
  totalCost: number; grossMargin: number; marginPct: number;
  marginTrend: number; forecast30dMargin: number; breakEvenPrice: number;
  status: "healthy" | "fair" | "warning" | "loss" | "no_cogs";
}
interface MarginData {
  summary: {
    totalProducts: number; losses: number; warnings: number; noCogs: number;
    healthy: number; totalForecast30dMargin: number;
  };
  products: MarginProduct[]; generatedAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function Skeleton({ h = "h-6", w = "w-full" }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} rounded bg-white/5 animate-pulse`} />;
}

function SectionCard({ title, icon: Icon, color, children, loading }: {
  title: string; icon: any; color: string; children: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {loading && <RefreshCw size={14} className="text-zinc-500 animate-spin ml-auto" />}
      </div>
      {children}
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  excellent: "text-emerald-400", good: "text-blue-400",
  marginal: "text-amber-400", poor: "text-red-400", no_sales: "text-zinc-500",
};
const STATUS_COLORS: Record<string, string> = {
  healthy: "text-emerald-400", fair: "text-blue-400",
  warning: "text-amber-400", loss: "text-red-400", no_cogs: "text-zinc-500",
};

/* ════════════════════════════════════════════════════════════════════════════ */
export default function AnalyticsPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null);
  const [ppc, setPpc] = useState<PpcData | null>(null);
  const [margin, setMargin] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAsin, setExpandedAsin] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"forecast" | "anomalies" | "ppc" | "margin">("forecast");

  const load = useCallback(async () => {
    setLoading(true);
    const [f, a, p, m] = await Promise.all([
      fetch(`${BASE}/api/analytics/forecast`).then(r => r.json()).catch(() => null),
      fetch(`${BASE}/api/analytics/anomalies`).then(r => r.json()).catch(() => null),
      fetch(`${BASE}/api/analytics/ppc-optimizer`).then(r => r.json()).catch(() => null),
      fetch(`${BASE}/api/analytics/margin-predictor`).then(r => r.json()).catch(() => null),
    ]);
    setForecast(f);
    setAnomalies(a);
    setPpc(p);
    setMargin(m);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const SECTIONS = [
    { key: "forecast" as const, label: "📈 Demand Forecast", icon: TrendingUp, color: "bg-blue-500/15 text-blue-400" },
    { key: "anomalies" as const, label: "🔍 Anomaly Detection", icon: AlertTriangle, color: "bg-amber-500/15 text-amber-400" },
    { key: "ppc" as const, label: "📣 PPC Optimizer", icon: Zap, color: "bg-purple-500/15 text-purple-400" },
    { key: "margin" as const, label: "💰 Margin Predictor", icon: DollarSign, color: "bg-emerald-500/15 text-emerald-400" },
  ];

  return (
    <div className="animate-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain size={24} className="text-purple-400" /> Analytics AI
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Analisi statistica avanzata: forecast, anomalie, ottimizzazione PPC, previsione margini
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-card border border-bg-border text-sm text-zinc-300 hover:text-white hover:bg-bg-hover transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Aggiorna
        </button>
      </div>

      {/* Section nav pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              activeSection === s.key
                ? "bg-bg-card border-bg-border text-white"
                : "border-transparent text-zinc-400 hover:text-white hover:bg-bg-card"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ─── 1. DEMAND FORECAST ─────────────────────────────────────────────────── */}
      {activeSection === "forecast" && (
        <SectionCard title="Demand Forecasting — 14 giorni" icon={TrendingUp} color="bg-blue-500/15 text-blue-400" loading={loading}>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} h="h-16" />)}</div>
          ) : !forecast?.items?.length ? (
            <p className="text-zinc-500 text-sm">Nessun dato disponibile. Avvia un backfill per popolare i dati Amazon.</p>
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "ASIN analizzati", value: fmtNum(forecast.items.length), icon: Package },
                  { label: "In crescita (>5%/mese)", value: fmtNum(forecast.items.filter(x => x.trendDirection === "up").length), icon: TrendingUp },
                  { label: "In calo (<-5%/mese)", value: fmtNum(forecast.items.filter(x => x.trendDirection === "down").length), icon: TrendingDown },
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-white/[0.02] border border-bg-border p-4 flex items-center gap-3">
                    <k.icon size={18} className="text-blue-400 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-500">{k.label}</p>
                      <p className="text-xl font-bold text-white tabular-nums">{k.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-bg-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {["ASIN / Prodotto", "Velocità/g", "Trend mese", "Forecast 14g", "Riordino stimato"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {forecast.items.slice(0, 30).map(item => {
                      const isOpen = expandedAsin === item.asin;
                      return (
                        <>
                          <tr
                            key={item.asin}
                            className="table-row-hover cursor-pointer"
                            onClick={() => setExpandedAsin(isOpen ? null : item.asin)}
                          >
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs text-zinc-400">{item.asin}</p>
                              <p className="text-white text-xs mt-0.5 max-w-[240px] truncate">{item.title}</p>
                            </td>
                            <td className="px-4 py-3 text-white tabular-nums">{item.velocity.toFixed(1)}</td>
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 font-medium ${
                                item.trendDirection === "up" ? "text-emerald-400" :
                                item.trendDirection === "down" ? "text-red-400" : "text-zinc-400"
                              }`}>
                                {item.trendDirection === "up" ? <ArrowUpRight size={13} /> :
                                 item.trendDirection === "down" ? <ArrowDownRight size={13} /> : <Minus size={13} />}
                                {fmtPct(Math.abs(item.trendPctPerMonth))}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white tabular-nums font-medium">{fmtNum(item.forecast14Total)} u</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                                {fmtNum(item.reorderQty)} u
                              </span>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${item.asin}-chart`} className="bg-white/[0.02]">
                              <td colSpan={5} className="px-4 py-4">
                                <p className="text-xs text-zinc-500 mb-3">Forecast 14 giorni — unità/giorno</p>
                                <ResponsiveContainer width="100%" height={140}>
                                  <AreaChart data={item.forecast14} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={30} />
                                    <Tooltip contentStyle={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }} />
                                    <Area type="monotone" dataKey="units" stroke="#60a5fa" fill="rgba(96,165,250,0.1)" strokeWidth={2} dot={false} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {forecast.items.length > 30 && (
                <p className="text-xs text-zinc-500 mt-3 text-center">Mostrati 30 di {forecast.items.length} ASIN</p>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* ─── 2. ANOMALY DETECTION ───────────────────────────────────────────────── */}
      {activeSection === "anomalies" && (
        <SectionCard title="Anomaly Detection — Ultime 7 settimane" icon={AlertTriangle} color="bg-amber-500/15 text-amber-400" loading={loading}>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} h="h-16" />)}</div>
          ) : !anomalies ? (
            <p className="text-zinc-500 text-sm">Nessun dato disponibile.</p>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-4 mb-5">
                {[
                  { label: "ASIN analizzati", value: fmtNum(anomalies.totalAnalyzed), color: "text-zinc-300" },
                  { label: "Anomalie critiche", value: fmtNum(anomalies.anomalies.filter(a => a.severity === "high").length), color: "text-red-400" },
                  { label: "Anomalie medie", value: fmtNum(anomalies.anomalies.filter(a => a.severity === "medium").length), color: "text-amber-400" },
                  { label: "Stabili", value: fmtNum(anomalies.stable.length), color: "text-emerald-400" },
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-white/[0.02] border border-bg-border p-4">
                    <p className="text-xs text-zinc-500 mb-1">{k.label}</p>
                    <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {anomalies.anomalies.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Target size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-emerald-400 font-medium">Nessuna anomalia rilevata</p>
                    <p className="text-xs text-zinc-500">Tutti i prodotti rientrano nei parametri statistici normali</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {anomalies.anomalies.map(a => (
                    <div key={`${a.asin}-${a.marketplace}`} className={`rounded-xl border p-4 ${
                      a.severity === "high" ? "border-red-500/30 bg-red-500/5" :
                      a.severity === "medium" ? "border-amber-500/30 bg-amber-500/5" :
                      "border-zinc-700 bg-white/[0.02]"
                    }`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              a.severity === "high" ? "bg-red-500/20 text-red-400" :
                              a.severity === "medium" ? "bg-amber-500/20 text-amber-400" :
                              "bg-zinc-700 text-zinc-400"
                            }`}>{a.severity}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              a.direction === "spike" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>{a.direction === "spike" ? "↑ Spike" : "↓ Drop"}</span>
                            <span className="text-xs text-zinc-500">{a.marketplace}</span>
                          </div>
                          <p className="font-mono text-xs text-zinc-400">{a.asin}</p>
                          <p className="text-sm text-white mt-0.5 truncate">{a.title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold tabular-nums ${a.direction === "spike" ? "text-emerald-400" : "text-red-400"}`}>
                            {a.pctChange > 0 ? "+" : ""}{fmtPct(a.pctChange)}
                          </p>
                          <p className="text-xs text-zinc-500">vs media 30g</p>
                          <p className="text-xs text-zinc-500 mt-0.5">Z = {a.z.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-zinc-500">
                        <span>Media 7g: <strong className="text-zinc-300">{a.avg7.toFixed(1)} u/g</strong></span>
                        <span>Media 30g: <strong className="text-zinc-300">{a.mean30.toFixed(1)} u/g</strong></span>
                        <span>Std dev: <strong className="text-zinc-300">{a.std30.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* ─── 3. PPC OPTIMIZER ───────────────────────────────────────────────────── */}
      {activeSection === "ppc" && (
        <SectionCard title="PPC Optimizer — Ottimizzazione Budget Campagne" icon={Zap} color="bg-purple-500/15 text-purple-400" loading={loading}>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} h="h-16" />)}</div>
          ) : !ppc ? (
            <p className="text-zinc-500 text-sm">Nessun dato PPC disponibile. Configura le credenziali Advertising API.</p>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                  { label: "ACOS globale", value: fmtPct(ppc.summary.overallAcos), color: ppc.summary.overallAcos > 30 ? "text-red-400" : "text-emerald-400" },
                  { label: "ROAS globale", value: ppc.summary.overallRoas?.toFixed(2) + "x", color: "text-blue-400" },
                  { label: "Risparmio potenziale", value: fmtEur(ppc.summary.savingOpportunity), color: "text-amber-400" },
                  { label: "Budget da riallocare", value: fmtEur(ppc.summary.reallocationSuggestion), color: "text-purple-400" },
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-white/[0.02] border border-bg-border p-4">
                    <p className="text-xs text-zinc-500 mb-1">{k.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Tier distribution */}
              <div className="grid grid-cols-5 gap-2 mb-5">
                {(["excellent","good","marginal","poor","no_sales"] as const).map(tier => (
                  <div key={tier} className="rounded-xl bg-white/[0.02] border border-bg-border p-3 text-center">
                    <p className={`text-lg font-bold ${TIER_COLORS[tier]}`}>
                      {ppc.summary.campaignsByTier[tier] ?? 0}
                    </p>
                    <p className="text-xs text-zinc-500 capitalize mt-0.5">{tier.replace("_"," ")}</p>
                  </div>
                ))}
              </div>

              {/* Campaign chart */}
              {ppc.campaigns.length > 0 && (
                <div className="mb-5 rounded-xl border border-bg-border p-4">
                  <p className="text-xs text-zinc-500 mb-3">Spend vs Sales per campagna (top 15)</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={ppc.campaigns.slice(0, 15)} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="campaignName" tick={{ fontSize: 9, fill: "#71717a" }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={45}
                        tickFormatter={v => `€${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                      <Tooltip
                        contentStyle={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any, name: string) => [fmtEur(v), name === "spend" ? "Spend" : "Sales"]}
                      />
                      <Bar dataKey="spend" fill="#a78bfa" radius={[4, 4, 0, 0]} name="spend" />
                      <Bar dataKey="sales" fill="#34d399" radius={[4, 4, 0, 0]} name="sales" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Campaign table */}
              <div className="overflow-x-auto rounded-xl border border-bg-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {["Campagna", "Tier", "Spend", "Sales", "ACOS", "ROAS", "Raccomandazione"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {ppc.campaigns.map(c => (
                      <tr key={c.campaignId} className="table-row-hover">
                        <td className="px-4 py-3">
                          <p className="text-white text-xs max-w-[200px] truncate">{c.campaignName}</p>
                          <p className="text-zinc-500 text-xs">{c.campaignType}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold uppercase ${TIER_COLORS[c.tier]}`}>{c.tier.replace("_"," ")}</span>
                        </td>
                        <td className="px-4 py-3 text-white tabular-nums text-xs">{fmtEur(c.spend)}</td>
                        <td className="px-4 py-3 text-white tabular-nums text-xs">{fmtEur(c.sales)}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={c.acos != null && c.acos > 30 ? "text-red-400" : "text-emerald-400"}>
                            {c.acos != null ? fmtPct(c.acos) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums text-xs">
                          {c.roas != null ? c.roas.toFixed(2) + "x" : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400 max-w-[180px]">{c.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ─── 4. MARGIN PREDICTOR ─────────────────────────────────────────────────── */}
      {activeSection === "margin" && (
        <SectionCard title="Margin Predictor — Analisi Margini & Forecast 30 giorni" icon={DollarSign} color="bg-emerald-500/15 text-emerald-400" loading={loading}>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} h="h-16" />)}</div>
          ) : !margin ? (
            <p className="text-zinc-500 text-sm">Nessun dato disponibile.</p>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
                {[
                  { label: "Prodotti totali", value: fmtNum(margin.summary.totalProducts), color: "text-zinc-300" },
                  { label: "In perdita", value: fmtNum(margin.summary.losses), color: "text-red-400" },
                  { label: "Warning (<10%)", value: fmtNum(margin.summary.warnings), color: "text-amber-400" },
                  { label: "Senza COGS", value: fmtNum(margin.summary.noCogs), color: "text-zinc-500" },
                  { label: "Forecast margine 30g", value: fmtEur(margin.summary.totalForecast30dMargin), color: "text-emerald-400" },
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-white/[0.02] border border-bg-border p-4">
                    <p className="text-xs text-zinc-500 mb-1">{k.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* No COGS warning */}
              {margin.summary.noCogs > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 mb-5">
                  <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-zinc-400">
                    <strong className="text-blue-400">{margin.summary.noCogs} prodotti</strong> non hanno COGS configurati.
                    Configura i costi in <strong>COGS</strong> per calcoli accurati.
                    Il fee model stimato è: 15% referral + €3,80/unità FBA.
                  </p>
                </div>
              )}

              {/* Product table */}
              <div className="overflow-x-auto rounded-xl border border-bg-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {["ASIN / Prodotto", "Status", "Rev/u", "COGS/u", "Margine %", "Trend", "Forecast 30g", "Break-even"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {margin.products.map(p => (
                      <tr key={`${p.asin}-${p.marketplace}`} className="table-row-hover">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-zinc-400">{p.asin}</p>
                          <p className="text-white text-xs mt-0.5 max-w-[200px] truncate">{p.title}</p>
                          <p className="text-zinc-600 text-xs">{p.marketplace}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold uppercase ${STATUS_COLORS[p.status]}`}>{p.status.replace("_"," ")}</span>
                        </td>
                        <td className="px-4 py-3 text-white tabular-nums text-xs">{fmtEur(p.avgRevPerUnit)}</td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums text-xs">{p.cogs > 0 ? fmtEur(p.cogs) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold tabular-nums ${
                            p.marginPct < 0 ? "text-red-400" :
                            p.marginPct < 10 ? "text-amber-400" :
                            p.marginPct < 25 ? "text-blue-400" : "text-emerald-400"
                          }`}>{fmtPct(p.marginPct)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs ${
                            p.marginTrend > 0.5 ? "text-emerald-400" :
                            p.marginTrend < -0.5 ? "text-red-400" : "text-zinc-400"
                          }`}>
                            {p.marginTrend > 0.5 ? <ArrowUpRight size={12} /> :
                             p.marginTrend < -0.5 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
                            {p.marginTrend.toFixed(1)}%/m
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white tabular-nums text-xs font-medium">{fmtEur(p.forecast30dMargin)}</td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums text-xs">{fmtEur(p.breakEvenPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
