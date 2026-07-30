"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import AmazonFilterBar from "@/components/amazon/AmazonFilterBar";
import {
  RefreshCw, ChevronLeft, Search, TrendingUp, DollarSign, MousePointer,
  ShoppingCart, BarChart2, Zap, Download, ChevronDown, ChevronUp,
  ArrowRight, Target, Eye,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { fmtEur, fmtNum, fmtPct as fmtPctLib } from "@/lib/fmt";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MP_FLAG: Record<string, string> = { IT:"🇮🇹", DE:"🇩🇪", FR:"🇫🇷", ES:"🇪🇸" };

function fmtPct(v: number | null) { return v != null ? fmtPctLib(v) : "—"; }

// Detect campaign type from name or stored type
function getCampaignType(name: string, storedType?: string): "SP" | "SB" | "SD" | "SBV" {
  const n = (name + " " + (storedType ?? "")).toUpperCase();
  if (n.includes("SBV") || n.includes("VIDEO")) return "SBV";
  if (n.includes(" SB") || n.includes("BRAND") || n.includes("HSA")) return "SB";
  if (n.includes(" SD") || n.includes("DISPLAY")) return "SD";
  return "SP";
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    SP:  { label: "SP",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    SB:  { label: "SB",  cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    SD:  { label: "SD",  cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    SBV: { label: "SBV", cls: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  };
  const c = cfg[type] ?? cfg.SP;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
}

function StateBadge({ state }: { state: string }) {
  if (state === "ENABLED" || state === "ACTIVE")
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">● Attiva</span>;
  if (state === "PAUSED")
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400">⏸ Pausa</span>;
  if (state === "ARCHIVED")
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-700/50 text-zinc-500">✕ Archiv.</span>;
  return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] text-zinc-600 bg-zinc-800">—</span>;
}

function MatchBadge({ matchType }: { matchType: string }) {
  const cfg: Record<string, string> = {
    EXACT:  "bg-blue-500/15 text-blue-400",
    PHRASE: "bg-purple-500/15 text-purple-400",
    BROAD:  "bg-emerald-500/15 text-emerald-400",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg[matchType] ?? "bg-zinc-800 text-zinc-500"}`}>
      {matchType || "—"}
    </span>
  );
}

function AcosBadge({ acos }: { acos: number | null }) {
  if (acos == null) return <span className="text-zinc-600">—</span>;
  const cls = acos <= 15 ? "text-emerald-400" : acos <= 30 ? "text-blue-400" : acos <= 50 ? "text-amber-400" : "text-red-400";
  return <span className={`${cls} font-semibold tabular-nums`}>{acos.toFixed(1)}%</span>;
}

function KpiMini({ label, value, sub, color = "text-white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function SortTh({ col, label, current, dir, onSort, right = false }: {
  col: string; label: string; current: string; dir: "asc"|"desc"; onSort: (c:string)=>void; right?: boolean;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-3 text-${right?"right":"left"} text-zinc-500 font-medium uppercase tracking-wide cursor-pointer select-none hover:text-white whitespace-nowrap transition-colors text-[11px]`}
    >
      {label}{active && (dir === "desc" ? " ↓" : " ↑")}
    </th>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const spend = payload.find((p: any) => p.dataKey === "spend")?.value ?? 0;
  const sales = payload.find((p: any) => p.dataKey === "sales")?.value ?? 0;
  const acos  = sales > 0 ? ((spend / sales) * 100).toFixed(1) + "%" : "—";
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl px-4 py-3 shadow-xl text-xs space-y-1.5 min-w-[160px]">
      <p className="text-zinc-400 font-medium mb-2">{label}</p>
      <div className="flex justify-between gap-4"><span className="text-zinc-500">Spesa</span><span className="text-amber-400 font-semibold">{fmtEur(spend)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-zinc-500">Vendite</span><span className="text-emerald-400 font-semibold">{fmtEur(sales)}</span></div>
      <div className="border-t border-bg-border pt-1 flex justify-between gap-4 text-zinc-500"><span>ACoS</span><span>{acos}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function CampaignDetail({
  campaign, filter, marketplace, onBack,
}: {
  campaign: any; filter: string; marketplace: string; onBack: () => void;
}) {
  const [daily,     setDaily]     = useState<any[]>([]);
  const [keywords,  setKeywords]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [kwSyncing, setKwSyncing] = useState(false);
  const [tab,       setTab]       = useState<"performance"|"keywords">("performance");
  const [kwSort,    setKwSort]    = useState("spend");
  const [kwDir,     setKwDir]     = useState<"asc"|"desc">("desc");
  const [kwSearch,  setKwSearch]  = useState("");

  const loadDetail = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { filter };
    if (marketplace && marketplace !== "all") params.marketplace = marketplace;
    api.amazon.ppcCampaignDetail(campaign.campaignId, params)
      .then((r) => {
        setDaily(r.daily ?? []);
        setKeywords(r.keywords ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaign.campaignId, filter, marketplace]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function syncKeywords() {
    setKwSyncing(true);
    try {
      await api.amazon.triggerKeywordSync(30);
      // Poll every 20s for up to 20 min
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const params: Record<string, string> = { filter };
        if (marketplace && marketplace !== "all") params.marketplace = marketplace;
        const r = await api.amazon.ppcCampaignDetail(campaign.campaignId, params).catch(() => null);
        if (r && r.keywords.length > 0) {
          setKeywords(r.keywords);
          setKwSyncing(false);
          clearInterval(poll);
        } else if (attempts >= 60) {
          setKwSyncing(false);
          clearInterval(poll);
        }
      }, 20_000);
    } catch {
      setKwSyncing(false);
    }
  }

  const totalSpend  = daily.reduce((s, d) => s + d.spend, 0);
  const totalSales  = daily.reduce((s, d) => s + d.sales, 0);
  const totalClicks = daily.reduce((s, d) => s + d.clicks, 0);
  const totalImpr   = daily.reduce((s, d) => s + d.impressions, 0);
  const totalOrders = daily.reduce((s, d) => s + d.orders, 0);
  const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : null;
  const roas = totalSpend > 0 ? totalSales / totalSpend : null;

  function handleKwSort(col: string) {
    if (kwSort === col) setKwDir(d => d === "asc" ? "desc" : "asc");
    else { setKwSort(col); setKwDir("desc"); }
  }

  const filteredKw = useMemo(() => {
    let list = keywords.filter(kw =>
      !kwSearch || kw.keywordText.toLowerCase().includes(kwSearch.toLowerCase())
    );
    return [...list].sort((a, b) => {
      const av = a[kwSort] ?? 0, bv = b[kwSort] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return kwDir === "asc" ? cmp : -cmp;
    });
  }, [keywords, kwSearch, kwSort, kwDir]);

  const campaignType = getCampaignType(campaign.campaignName, campaign.campaignType);

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white mb-3 transition-colors"
          >
            <ChevronLeft size={13} /> Tutte le Campagne
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <TypeBadge type={campaignType} />
            <h2 className="text-lg font-bold text-white leading-tight">{campaign.campaignName}</h2>
            <StateBadge state={campaign.state} />
            <span className="text-xs text-zinc-500">{MP_FLAG[campaign.marketplace] ?? campaign.marketplace}</span>
          </div>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMini label="Spesa"    value={fmtEur(totalSpend)}  color="text-amber-400" />
        <KpiMini label="Vendite"  value={fmtEur(totalSales)}  color="text-emerald-400" />
        <KpiMini label="ACoS"     value={fmtPct(acos)}     color={acos == null ? "text-zinc-500" : acos <= 30 ? "text-emerald-400" : acos <= 50 ? "text-amber-400" : "text-red-400"} />
        <KpiMini label="ROAS"     value={roas != null ? roas.toFixed(2) + "x" : "—"} color="text-blue-400" />
        <KpiMini label="Click"    value={fmtNum(totalClicks)} />
        <KpiMini label="Ordini"   value={fmtNum(totalOrders)} color="text-purple-400" />
      </div>

      {/* Tab bar + sync button */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1">
          {[
            { id: "performance", label: "📈 Performance" },
            { id: "keywords",    label: `🔑 Parole Chiave${keywords.length > 0 ? ` (${keywords.length})` : ""}` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                tab === t.id
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "keywords" && (
          <button
            onClick={syncKeywords}
            disabled={kwSyncing}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={kwSyncing ? "animate-spin" : ""} />
            {kwSyncing ? "Sync in corso (~10 min)…" : "🔄 Aggiorna Parole Chiave"}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-zinc-500 text-sm">
          <RefreshCw size={14} className="animate-spin" /> Caricamento...
        </div>
      )}

      {/* Performance chart */}
      {!loading && tab === "performance" && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Spend vs Vendite (giornaliero)</h3>
          {daily.length === 0 ? (
            <p className="text-zinc-600 text-sm py-8 text-center">Nessun dato per il periodo selezionato</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => fmtEur(v)} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                <Area type="monotone" dataKey="spend" name="Spesa" stroke="#f59e0b" strokeWidth={2} fill="url(#gSpend)" dot={false} />
                <Area type="monotone" dataKey="sales" name="Vendite" stroke="#10b981" strokeWidth={2} fill="url(#gSales)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Keywords table */}
      {!loading && tab === "keywords" && (
        <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border flex items-center gap-3">
            <div className="flex items-center gap-2 bg-bg-base border border-bg-border rounded-lg px-3 py-1.5 flex-1 max-w-xs">
              <Search size={12} className="text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Cerca parola chiave..."
                value={kwSearch}
                onChange={(e) => setKwSearch(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
              />
            </div>
            <span className="text-xs text-zinc-600">{filteredKw.length} parole chiave</span>
          </div>
          {filteredKw.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              {keywords.length === 0 ? (
                <>
                  <p className="text-zinc-500 text-sm">Nessuna parola chiave trovata per questa campagna</p>
                  <p className="text-zinc-600 text-xs max-w-md mx-auto">
                    {kwSyncing
                      ? "⏳ Sync in corso — Amazon genera il report in ~10-15 min. La pagina si aggiorna automaticamente."
                      : "Clicca '🔄 Aggiorna Parole Chiave' per importare i dati da Amazon (richiede ~10-15 min)."}
                  </p>
                  {kwSyncing && (
                    <div className="flex justify-center">
                      <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2">
                        <RefreshCw size={11} className="animate-spin" /> Elaborazione report Amazon...
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-zinc-600 text-sm">Nessuna corrispondenza per la ricerca</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-bg-border">
                    <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Parola Chiave</th>
                    <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Match</th>
                    <SortTh col="impressions" label="Impr." current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="clicks"      label="Click" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="ctr"         label="CTR"   current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="spend"       label="Spesa" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="sales"       label="Vendite" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="orders"      label="Ordini" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="acos"        label="ACoS" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                    <SortTh col="cpc"         label="CPC" current={kwSort} dir={kwDir} onSort={handleKwSort} right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-border/50">
                  {filteredKw.map((kw) => (
                    <tr key={`${kw.keywordId}-${kw.marketplace}`} className="table-row-hover">
                      <td className="px-4 py-2.5 text-zinc-200 font-medium max-w-[240px] truncate">{kw.keywordText || <span className="text-zinc-600">ID: {kw.keywordId}</span>}</td>
                      <td className="px-3 py-2.5"><MatchBadge matchType={kw.matchType} /></td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{fmtNum(kw.impressions)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{fmtNum(kw.clicks)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{kw.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-right text-amber-400 font-semibold tabular-nums">{fmtEur(kw.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400 tabular-nums">{fmtEur(kw.sales)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{fmtNum(kw.orders)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums"><AcosBadge acos={kw.acos} /></td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{fmtEur(kw.cpc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-PRODUCT VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsTab({ filter, marketplace }: { filter: string; marketplace: string }) {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [sortCol,    setSortCol]    = useState("spend");
  const [sortDir,    setSortDir]    = useState<"asc"|"desc">("desc");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { filter };
      if (marketplace && marketplace !== "all") params.marketplace = marketplace;
      const res = await api.amazon.ppcProducts(params);
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter, marketplace]);

  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function toggleExpand(product: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(product) ? n.delete(product) : n.add(product);
      return n;
    });
  }

  const products: any[] = data?.products ?? [];
  const totals = data?.totals;

  const filtered = useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.product.toLowerCase().includes(q) || (p.asin ?? "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [products, search, sortCol, sortDir]);

  // Efficiency rating
  function efficiency(acos: number | null): { label: string; cls: string } {
    if (acos === null) return { label: "N/D", cls: "text-zinc-500" };
    if (acos <= 15) return { label: "🟢 Ottimo",    cls: "text-emerald-400" };
    if (acos <= 25) return { label: "🟢 Buono",     cls: "text-emerald-400" };
    if (acos <= 35) return { label: "🟡 Discreto",  cls: "text-amber-400" };
    if (acos <= 50) return { label: "🟠 Attenzione", cls: "text-orange-400" };
    return               { label: "🔴 Alto",        cls: "text-red-400" };
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiMini label="Prodotti"      value={String(totals.products)}   />
          <KpiMini label="Spesa Totale"  value={fmtEur(totals.spend)}      color="text-amber-400" />
          <KpiMini label="Vendite PPC"   value={fmtEur(totals.sales)}      color="text-emerald-400" />
          <KpiMini label="Ordini"        value={fmtNum(totals.orders)}      color="text-purple-400" />
        </div>
      )}

      {/* Search + count */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-lg px-3 py-2 flex-1 min-w-[180px] max-w-[280px]">
          <Search size={12} className="text-zinc-500 shrink-0" />
          <input type="text" placeholder="Cerca prodotto o ASIN..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full" />
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="ml-auto text-xs text-zinc-600">{filtered.length} prodotti</span>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[860px]">
            <thead>
              <tr className="border-b border-bg-border bg-bg-base/30">
                <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Prodotto</th>
                <SortTh col="campaignCount" label="Camp." current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="dailySpend"    label="Spesa/gg"   current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="spend"         label="Spesa Tot." current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="sales"         label="Vendite"    current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="orders"        label="Ordini"     current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="acos"          label="ACoS"       current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="roas"          label="ROAS"       current={sortCol} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Efficienza</th>
                <th className="px-3 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-bg-border rounded animate-pulse" style={{ width: j === 0 ? "70%" : "45%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-zinc-600 text-sm">
                    {products.length === 0
                      ? "Nessun dato — esegui un sync per importare i dati PPC"
                      : "Nessun prodotto corrisponde alla ricerca"}
                  </td>
                </tr>
              ) : (
                filtered.flatMap((p) => {
                  const isOpen = expanded.has(p.product);
                  const eff = efficiency(p.acos);
                  return [
                    // Main product row
                    <tr
                      key={p.product}
                      onClick={() => toggleExpand(p.product)}
                      className="table-row-hover cursor-pointer hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isOpen
                            ? <ChevronUp size={12} className="text-zinc-500 shrink-0" />
                            : <ChevronDown size={12} className="text-zinc-500 shrink-0" />}
                          <div>
                            <div className="text-zinc-200 font-semibold leading-tight">{p.product}</div>
                            {p.asin && (
                              <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{p.asin}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-400 tabular-nums">{p.campaignCount}</td>
                      <td className="px-3 py-3 text-right text-amber-400 font-semibold tabular-nums">{fmtEur(p.dailySpend)}</td>
                      <td className="px-3 py-3 text-right text-amber-400/80 tabular-nums">{fmtEur(p.spend)}</td>
                      <td className="px-3 py-3 text-right text-emerald-400 tabular-nums">{fmtEur(p.sales)}</td>
                      <td className="px-3 py-3 text-right text-zinc-300 tabular-nums">{fmtNum(p.orders)}</td>
                      <td className="px-3 py-3 text-right tabular-nums"><AcosBadge acos={p.acos} /></td>
                      <td className="px-3 py-3 text-right text-blue-400 tabular-nums">
                        {p.roas != null ? p.roas.toFixed(2) + "x" : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] font-medium ${eff.cls}`}>{eff.label}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {isOpen
                          ? <ChevronUp size={11} className="text-zinc-500" />
                          : <ChevronDown size={11} className="text-zinc-600" />}
                      </td>
                    </tr>,
                    // Campaign sub-rows (expanded)
                    ...(isOpen ? p.campaigns.map((c: any) => (
                      <tr key={`${p.product}-${c.campaignId}-${c.marketplace}`}
                        className="bg-bg-base/40 border-l-2 border-accent-primary/20">
                        <td className="px-4 py-2 pl-12" colSpan={1}>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-600">{MP_FLAG[c.marketplace] ?? c.marketplace}</span>
                            <span className="text-zinc-400 text-[11px] truncate max-w-[260px]" title={c.campaignName}>
                              {c.campaignName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600 text-[11px]">—</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right text-amber-400/70 tabular-nums text-[11px]">{fmtEur(c.spend)}</td>
                        <td className="px-3 py-2 text-right text-emerald-400/70 tabular-nums text-[11px]">{fmtEur(c.sales)}</td>
                        <td className="px-3 py-2 text-right text-zinc-500 tabular-nums text-[11px]">{fmtNum(c.orders)}</td>
                        <td className="px-3 py-2 text-right tabular-nums"><AcosBadge acos={c.acos} /></td>
                        <td className="px-3 py-2" colSpan={3} />
                      </tr>
                    )) : []),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-bg-border flex items-center justify-between text-[11px] text-zinc-600">
            <span>{filtered.length} prodotti · {totals?.spend > 0 ? ((totals.sales / totals.spend).toFixed(2) + "x ROAS globale") : ""}</span>
            <div className="flex gap-4">
              <span>Spesa: <strong className="text-amber-400">{fmtEur(totals?.spend ?? 0)}</strong></span>
              <span>Vendite: <strong className="text-emerald-400">{fmtEur(totals?.sales ?? 0)}</strong></span>
              <span>ACoS: <strong className={totals?.spend > 0 && totals?.sales > 0 && (totals.spend / totals.sales) <= 0.3 ? "text-emerald-400" : "text-amber-400"}>
                {totals?.sales > 0 ? ((totals.spend / totals.sales) * 100).toFixed(1) + "%" : "—"}
              </strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH TERMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function SearchTermsTab({ marketplace }: { marketplace: string }) {
  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [wastedOnly,  setWastedOnly]  = useState(false);
  const [search,      setSearch]      = useState("");
  const [sortCol,     setSortCol]     = useState("spend");
  const [sortDir,     setSortDir]     = useState<"asc"|"desc">("desc");
  const [pollTimer,   setPollTimer]   = useState<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "2000" };
      if (marketplace && marketplace !== "all") params.marketplace = marketplace;
      if (wastedOnly) params.wastedOnly = "true";
      const res = await api.amazon.ppcSearchTerms(params);
      setData(res);
      if (res.syncing) {
        setSyncing(true);
      } else {
        setSyncing(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [marketplace, wastedOnly]);

  useEffect(() => { load(); }, [load]);

  // Poll while syncing
  useEffect(() => {
    if (syncing && !pollTimer) {
      const t = setInterval(() => { load(); }, 30_000);
      setPollTimer(t);
    } else if (!syncing && pollTimer) {
      clearInterval(pollTimer);
      setPollTimer(null);
    }
    return () => { if (pollTimer) clearInterval(pollTimer); };
  }, [syncing]);

  async function triggerSync() {
    setSyncing(true);
    try {
      const mp = marketplace !== "all" ? marketplace : undefined;
      await api.amazon.triggerSearchTermSync(30, mp);
      // Start polling
      const t = setInterval(() => { load(); }, 30_000);
      setPollTimer(t);
    } catch (e) {
      console.error(e);
      setSyncing(false);
    }
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const terms: any[] = data?.searchTerms ?? [];
  const totals = data?.totals;

  // Client-side search filter
  const filtered = useMemo(() => {
    let list = terms;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.query.toLowerCase().includes(q) || r.keywordText.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [terms, search, sortCol, sortDir]);

  // CSV export
  function exportCsv() {
    const header = ["Termine ricerca","Keyword","Match","Campagna","Marketplace","Impr.","Click","CTR%","Spesa","Vendite","Ordini","ACoS%","CPC","Wasted"];
    const rows = filtered.map(r => [
      r.query, r.keywordText, r.matchType, r.campaignName, r.marketplace,
      r.impressions, r.clicks, r.ctr.toFixed(2), r.spend.toFixed(2),
      r.sales.toFixed(2), r.orders, r.acos != null ? r.acos.toFixed(1) : "",
      r.cpc.toFixed(2), r.isWasted ? "SI" : "NO",
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `search-terms-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const wastedSpend = totals?.wasted ?? 0;
  const wastedCount = totals?.wastedCount ?? 0;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-lg px-3 py-2 min-w-[220px]">
            <Search size={12} className="text-zinc-500 shrink-0" />
            <input type="text" placeholder="Cerca termine o campagna..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full" />
          </div>
          {/* Wasted filter */}
          <button
            onClick={() => setWastedOnly(w => !w)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${wastedOnly ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-bg-card border-bg-border text-zinc-500 hover:text-white"}`}
          >
            🔥 Solo Wasted ({wastedCount})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {data?.generatedAt && (
            <span className="text-[11px] text-zinc-600">
              Aggiornato: {new Date(data.generatedAt).toLocaleDateString("it-IT")}
              {data.dateFrom && ` · ${data.dateFrom} → ${data.dateTo}`}
              {data.source === "db" && " · 💾 DB"}
            </span>
          )}
          <button onClick={exportCsv} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-40">
            <Download size={11} /> Esporta CSV
          </button>
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50">
            <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sync in corso (~10 min)…" : "🔍 Scarica Report"}
          </button>
          <button onClick={load}
            className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Syncing banner */}
      {syncing && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          <div>
            <span className="font-semibold">Generazione report in corso</span>
            <span className="text-amber-400/70 ml-2 text-xs">Amazon impiega 10-15 min. La pagina si aggiorna ogni 30 secondi automaticamente.</span>
          </div>
        </div>
      )}

      {/* KPI strip */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiMini label="Termini"        value={fmtNum(filtered.length)}  />
          <KpiMini label="Spesa Totale"   value={fmtEur(totals.spend)}     color="text-amber-400" />
          <KpiMini label="Vendite"        value={fmtEur(totals.sales)}     color="text-emerald-400" />
          <KpiMini label="Ordini"         value={fmtNum(totals.orders)}    color="text-purple-400" />
          <KpiMini label="Spesa Wasted"   value={fmtEur(wastedSpend)}      color="text-red-400" sub={`${wastedCount} termini senza conversioni`} />
          <KpiMini label="Wasted %"       value={totals.spend > 0 ? ((wastedSpend / totals.spend) * 100).toFixed(1) + "%" : "—"} color={wastedSpend / totals.spend > 0.15 ? "text-red-400" : "text-amber-400"} />
        </div>
      )}

      {/* Empty state */}
      {!loading && terms.length === 0 && !syncing && (
        <div className="bg-bg-card border border-bg-border rounded-xl py-16 text-center space-y-3">
          <Target size={32} className="text-zinc-700 mx-auto" />
          <p className="text-zinc-400 font-medium">Nessun termine di ricerca trovato</p>
          <p className="text-zinc-600 text-xs max-w-sm mx-auto">
            Clicca <strong className="text-amber-400">🔍 Scarica Report</strong> per generare il report da Amazon.
            Il processo richiede 10-15 minuti.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || filtered.length > 0) && (
        <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="border-b border-bg-border bg-bg-base/30">
                  <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px] min-w-[180px]">Termine Ricerca</th>
                  <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px] min-w-[140px]">Keyword</th>
                  <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Match</th>
                  <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px] min-w-[160px]">Campagna</th>
                  <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">MP</th>
                  <SortTh col="impressions" label="Impr."   current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="clicks"      label="Click"   current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="ctr"         label="CTR"     current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="spend"       label="Spesa"   current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="sales"       label="Vendite" current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="orders"      label="Ordini"  current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="acos"        label="ACoS"    current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <SortTh col="cpc"         label="CPC"     current={sortCol} dir={sortDir} onSort={handleSort} right />
                  <th className="px-3 py-3 text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border/50">
                {loading ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 14 }).map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-3 bg-bg-border rounded animate-pulse" style={{ width: j === 0 ? "80%" : j === 3 ? "70%" : "50%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-zinc-600 text-sm">
                      Nessun termine corrisponde ai filtri
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr key={i} className={`table-row-hover ${r.isWasted ? "bg-red-500/5" : ""}`}>
                      <td className="px-4 py-2.5 text-zinc-200 font-medium max-w-[200px]">
                        <span className="truncate block" title={r.query}>{r.query}</span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 max-w-[160px]">
                        <span className="truncate block" title={r.keywordText}>{r.keywordText || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5"><MatchBadge matchType={r.matchType} /></td>
                      <td className="px-3 py-2.5 text-zinc-500 max-w-[180px]">
                        <span className="truncate block text-[11px]" title={r.campaignName}>{r.campaignName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400">{MP_FLAG[r.marketplace] ?? r.marketplace}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{fmtNum(r.impressions)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{fmtNum(r.clicks)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{r.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-right text-amber-400 font-semibold tabular-nums">{fmtEur(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400 tabular-nums">{fmtEur(r.sales)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 tabular-nums">{fmtNum(r.orders)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums"><AcosBadge acos={r.acos} /></td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{fmtEur(r.cpc)}</td>
                      <td className="px-3 py-2.5">
                        {r.isWasted
                          ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400">🔥 Wasted</span>
                          : r.orders > 0
                            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">✓ Conv.</span>
                            : <span className="text-zinc-700 text-[11px]">—</span>
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-bg-border flex items-center justify-between text-[11px] text-zinc-600">
              <span>{filtered.length} termini · {wastedCount} wasted</span>
              <div className="flex gap-4">
                <span>Spesa: <strong className="text-amber-400">{fmtEur(totals?.spend ?? 0)}</strong></span>
                <span>Vendite: <strong className="text-emerald-400">{fmtEur(totals?.sales ?? 0)}</strong></span>
                <span>Wasted: <strong className="text-red-400">{fmtEur(wastedSpend)}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — Campaign Manager
// ═══════════════════════════════════════════════════════════════════════════════
export default function AmazonPpcPage() {
  const [filter,      setFilter]      = useState("last30");
  const [marketplace, setMarketplace] = useState("all");
  const [mainTab,     setMainTab]     = useState<"campagne"|"prodotti"|"termini">("campagne");

  // Data
  const [campaigns,   setCampaigns]   = useState<any[]>([]);
  const [totals,      setTotals]      = useState<any>(null);
  const [isFallback,  setIsFallback]  = useState(false);
  const [dataDate,    setDataDate]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);

  // Campaign detail drill-down
  const [selected,    setSelected]    = useState<any | null>(null);

  // Filters
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [sortCol,     setSortCol]     = useState("spend");
  const [sortDir,     setSortDir]     = useState<"asc"|"desc">("desc");

  // ── Load campaigns ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { filter };
      if (marketplace && marketplace !== "all") params.marketplace = marketplace;
      const res = await api.amazon.ppc(params);
      setCampaigns((res as any)?.campaigns ?? []);
      setTotals((res as any)?.totals ?? null);
      setIsFallback((res as any)?.isFallback ?? false);
      setDataDate((res as any)?.dataDate ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, marketplace]);

  useEffect(() => { load(); }, [load]);

  // ── Sync ───────────────────────────────────────────────────────────────────
  async function triggerSync(days?: number) {
    setSyncing(true);
    try {
      await api.amazon.triggerAdsSync(days);
      setTimeout(load, 5000);
    } finally {
      setSyncing(false);
    }
  }

  async function triggerKwSync() {
    setSyncing(true);
    try {
      await api.amazon.triggerKeywordSync(30);
    } finally {
      setSyncing(false);
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const enriched = useMemo(() =>
    campaigns.map(c => ({ ...c, _type: getCampaignType(c.campaignName, c.campaignType) })),
  [campaigns]);

  const filtered = useMemo(() => {
    let list = enriched.filter(c => {
      const normalState = c.state === "ACTIVE" ? "ENABLED" : c.state;
      if (stateFilter !== "ALL" && normalState !== stateFilter) return false;
      if (typeFilter  !== "ALL" && c._type !== typeFilter) return false;
      if (search && !c.campaignName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [enriched, stateFilter, typeFilter, search, sortCol, sortDir]);

  const filteredTotals = useMemo(() => {
    const spend  = filtered.reduce((s, c) => s + (c.spend ?? 0), 0);
    const sales  = filtered.reduce((s, c) => s + (c.sales ?? 0), 0);
    const clicks = filtered.reduce((s, c) => s + (c.clicks ?? 0), 0);
    const impr   = filtered.reduce((s, c) => s + (c.impressions ?? 0), 0);
    const orders = filtered.reduce((s, c) => s + (c.orders ?? 0), 0);
    return {
      spend, sales, clicks, impr, orders,
      acos: sales > 0 ? (spend / sales) * 100 : null,
      roas: spend > 0 ? sales / spend : null,
      cpc:  clicks > 0 ? spend / clicks : null,
      ctr:  impr > 0 ? (clicks / impr) * 100 : null,
    };
  }, [filtered]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { SP: 0, SB: 0, SD: 0 };
    for (const camp of enriched) c[camp._type] = (c[camp._type] ?? 0) + 1;
    return c;
  }, [enriched]);

  // ── If campaign selected, show detail view ─────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-5">
        <AmazonFilterBar filter={filter} marketplace={marketplace} onFilterChange={setFilter} onMarketplaceChange={setMarketplace} />
        <CampaignDetail
          campaign={selected}
          filter={filter}
          marketplace={marketplace}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  // ── Campaign manager list view ─────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">PPC Manager</h1>
          <p className="text-sm text-zinc-500 mt-1">Gestione campagne Amazon Advertising — EU</p>
        </div>
        {(mainTab === "campagne" || mainTab === "prodotti") && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => triggerSync()} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50">
              <Zap size={11} className={syncing ? "animate-pulse" : ""} />
              {syncing ? "In corso…" : "🔄 Sync Ieri"}
            </button>
            <button onClick={() => triggerSync(30)} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
              <Download size={11} /> 📥 Sync 30gg
            </button>
            <button onClick={triggerKwSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
              🔑 Sync Parole Chiave
            </button>
            <button onClick={load}
              className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <AmazonFilterBar filter={filter} marketplace={marketplace} onFilterChange={(f) => { setFilter(f); setSelected(null); }} onMarketplaceChange={(m) => { setMarketplace(m); setSelected(null); }} />

      {/* Main tab navigation */}
      <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-1 w-fit">
        {[
          { id: "campagne",  label: "📊 Campagne" },
          { id: "prodotti",  label: "📦 Per Prodotto" },
          { id: "termini",   label: "🔍 Termini di Ricerca" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id as any)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              mainTab === t.id
                ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Per-Product Tab */}
      {mainTab === "prodotti" && (
        <ProductsTab filter={filter} marketplace={marketplace} />
      )}

      {/* Search Terms Tab */}
      {mainTab === "termini" && (
        <SearchTermsTab marketplace={marketplace} />
      )}

      {/* Campaigns content (only when campagne tab active) */}
      {mainTab === "campagne" && <>

      {/* Fallback notice: Amazon PPC data not yet available for the requested period */}
      {isFallback && dataDate && (filter === "today" || filter === "yesterday") && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <Eye size={13} className="shrink-0" />
          <span>
            I dati PPC di <strong>{filter === "today" ? "oggi" : "ieri"}</strong> non sono ancora pronti — Amazon li pubblica con 24-48h di ritardo.
            Stai visualizzando l&apos;ultimo aggiornamento disponibile: <strong>{new Date(dataDate + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</strong>.
          </span>
          <button onClick={load} className="ml-auto shrink-0 underline hover:text-white transition-colors">Ricarica</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMini label="Spend Totale"  value={fmtEur(filteredTotals.spend)}  color="text-amber-400"   sub={`${fmtEur(filteredTotals.spend / 30)}/gg`} />
        <KpiMini label="Vendite PPC"   value={fmtEur(filteredTotals.sales)}  color="text-emerald-400" />
        <KpiMini label="ACoS"          value={fmtPct(filteredTotals.acos)} color={
          filteredTotals.acos == null ? "text-zinc-500" :
          filteredTotals.acos <= 25 ? "text-emerald-400" :
          filteredTotals.acos <= 40 ? "text-amber-400" : "text-red-400"
        } />
        <KpiMini label="ROAS"          value={filteredTotals.roas != null ? filteredTotals.roas.toFixed(2) + "x" : "—"} color="text-blue-400" />
        <KpiMini label="Click"         value={fmtNum(filteredTotals.clicks)} sub={`CTR ${fmtPct(filteredTotals.ctr)}`} />
        <KpiMini label="Ordini"        value={fmtNum(filteredTotals.orders)} color="text-purple-400" />
      </div>

      {/* Type breakdown + filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-lg px-3 py-2 flex-1 min-w-[180px] max-w-[280px]">
          <Search size={12} className="text-zinc-500 shrink-0" />
          <input type="text" placeholder="Cerca campagna..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full" />
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {[
            { k: "ALL", label: `Tutte (${enriched.length})` },
            { k: "SP",  label: `SP (${typeCounts.SP ?? 0})` },
            { k: "SB",  label: `SB (${typeCounts.SB ?? 0})` },
            { k: "SD",  label: `SD (${typeCounts.SD ?? 0})` },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${typeFilter === k ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-bg-card border-bg-border text-zinc-500 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* State filter */}
        <div className="flex gap-1">
          {[
            { k: "ALL",      label: "Tutte" },
            { k: "ENABLED",  label: "● Attive" },
            { k: "PAUSED",   label: "⏸ Pausa" },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setStateFilter(k)}
              className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                stateFilter === k
                  ? k === "ENABLED" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : k === "PAUSED"  ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  : "bg-bg-hover border-bg-border text-zinc-300"
                  : "bg-bg-card border-bg-border text-zinc-500 hover:text-white"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-zinc-600">{filtered.length} campagne</span>
      </div>

      {/* Campaign table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[920px]">
            <thead>
              <tr className="border-b border-bg-border bg-bg-base/30">
                <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px] w-8">Tipo</th>
                <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Campagna</th>
                <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px] w-12">MP</th>
                <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[11px]">Stato</th>
                <SortTh col="impressions" label="Impr."      current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="clicks"      label="Click"      current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="ctr"         label="CTR"        current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="dailySpend"  label="Spesa/gg"   current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="spend"       label="Spesa Tot." current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="sales"       label="Vendite"    current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="orders"      label="Ordini"     current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="acos"        label="ACoS"       current={sortCol} dir={sortDir} onSort={handleSort} right />
                <SortTh col="roas"        label="ROAS"       current={sortCol} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-[11px] w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-bg-border rounded animate-pulse" style={{ width: j === 1 ? "70%" : "50%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-zinc-600 text-sm">
                    {campaigns.length === 0
                      ? "Nessuna campagna — clicca 🔄 Sync Ieri per importare i dati"
                      : "Nessuna campagna corrisponde ai filtri"}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={`${c.campaignId}-${c.marketplace}`}
                    onClick={() => setSelected(c)}
                    className="table-row-hover cursor-pointer transition-colors hover:bg-bg-hover"
                  >
                    <td className="px-4 py-3"><TypeBadge type={c._type} /></td>
                    <td className="px-3 py-3 max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-200 font-medium truncate leading-tight" title={c.campaignName}>
                          {c.campaignName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{MP_FLAG[c.marketplace] ?? c.marketplace}</td>
                    <td className="px-3 py-3"><StateBadge state={c.state} /></td>
                    <td className="px-3 py-3 text-right text-zinc-400 tabular-nums">{fmtNum(c.impressions)}</td>
                    <td className="px-3 py-3 text-right text-zinc-300 tabular-nums">{fmtNum(c.clicks)}</td>
                    <td className="px-3 py-3 text-right text-zinc-400 tabular-nums">{c.ctr.toFixed(2)}%</td>
                    <td className="px-3 py-3 text-right text-amber-400 font-semibold tabular-nums">{fmtEur(c.dailySpend)}</td>
                    <td className="px-3 py-3 text-right text-amber-400/80 tabular-nums">{fmtEur(c.spend)}</td>
                    <td className="px-3 py-3 text-right text-emerald-400 tabular-nums">{fmtEur(c.sales)}</td>
                    <td className="px-3 py-3 text-right text-zinc-300 tabular-nums">{fmtNum(c.orders)}</td>
                    <td className="px-3 py-3 text-right tabular-nums"><AcosBadge acos={c.acos} /></td>
                    <td className="px-3 py-3 text-right text-blue-400 tabular-nums">{c.roas != null ? c.roas.toFixed(2) + "x" : "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <ArrowRight size={12} className="text-zinc-600 group-hover:text-zinc-300" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-bg-border">
            <div className="flex items-center justify-between text-[11px] text-zinc-600">
              <span>{filtered.length} campagne · Clicca una riga per i dettagli</span>
              <div className="flex gap-4">
                <span>Spesa: <strong className="text-amber-400">{fmtEur(filteredTotals.spend)}</strong></span>
                <span>Vendite: <strong className="text-emerald-400">{fmtEur(filteredTotals.sales)}</strong></span>
                <span>ACoS: <strong className={filteredTotals.acos != null && filteredTotals.acos <= 30 ? "text-emerald-400" : "text-amber-400"}>{fmtPct(filteredTotals.acos)}</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>

      </> /* end mainTab === campagne */}
    </div>
  );
}
