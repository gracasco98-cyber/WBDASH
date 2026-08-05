"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import {
  Package, AlertTriangle, RefreshCw, Truck, Lock, Wrench,
  Search as SearchIcon, TrendingDown, Globe2, BarChart3, ChevronDown, ChevronUp, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FbaItem {
  asin: string;
  fnSku: string;
  sellerSku: string;
  productName: string;
  marketplaces: string[];
  isPanEu: boolean;
  marketplace: string;
  fulfillableQuantity: number;
  inboundQuantity: number;
  inboundWorking: number;
  inboundShipped: number;
  inboundReceiving: number;
  reservedQuantity: number;
  unfulfillableQuantity: number;
  customerDamaged: number;
  warehouseDamaged: number;
  defective: number;
  expired: number;
  researchingQuantity: number;
  salesVelocity: number;
  salesVelocityByMarket: Record<string, number>;
  daysRemaining: number | null;
  status: string;
  imageUrl: string | null;
}

type StatusFilter = "all" | "available" | "critical" | "low" | "inbound" | "damaged" | "lost";
type SortKey     = "qty" | "days" | "velocity" | "damaged" | "lost" | "inbound" | "asin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MP_FLAG: Record<string, string> = {
  IT: "🇮🇹", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸", UK: "🇬🇧", PL: "🇵🇱",
};

function fmtN(n: number) { return n.toLocaleString("it-IT"); }

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, daysRemaining }: { status: string; daysRemaining: number | null }) {
  const cfg: Record<string, { cls: string; dot: string; label: string }> = {
    critical: { cls: "bg-red-500/15 text-red-400 border-red-500/25",              dot: "bg-red-400",     label: "Critico" },
    low:      { cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",        dot: "bg-amber-400",   label: "Basso"   },
    ok:       { cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",           dot: "bg-blue-400",    label: "OK"      },
    good:     { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",  dot: "bg-emerald-400", label: "Buono"   },
    unknown:  { cls: "bg-bg-hover text-zinc-500 border-zinc-600",                 dot: "bg-zinc-500",    label: "N/D"     },
  };
  const s = cfg[status] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {daysRemaining !== null ? `${daysRemaining}gg · ` : ""}{s.label}
    </span>
  );
}

// ─── Stock progress bar ───────────────────────────────────────────────────────

function StockBar({ days }: { days: number | null }) {
  if (days === null) return <div className="w-full h-1.5 rounded-full bg-bg-border" />;
  const pct   = Math.min(100, Math.max(0, (days / 90) * 100));
  const color = days <= 7 ? "bg-red-500" : days <= 30 ? "bg-amber-400" : days <= 60 ? "bg-blue-400" : "bg-emerald-400";
  return (
    <div className="w-full h-1.5 rounded-full bg-bg-border overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Marketplace badges ───────────────────────────────────────────────────────

function MpBadges({ marketplaces, isPanEu }: { marketplaces: string[]; isPanEu: boolean }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {isPanEu && (
        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-500/15 border border-blue-500/25 text-blue-400 uppercase tracking-wide">
          PAN‑EU
        </span>
      )}
      {marketplaces.map(mp => (
        <span key={mp} className="text-[13px]" title={mp}>{MP_FLAG[mp] ?? mp}</span>
      ))}
    </div>
  );
}

// ─── Velocity breakdown ───────────────────────────────────────────────────────

function VelocityCell({ velocity, byMarket }: { velocity: number; byMarket: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  if (velocity === 0) return <span className="text-zinc-700 tabular-nums">—</span>;
  const hasBreakdown = Object.keys(byMarket).filter(k => byMarket[k] > 0).length > 1;
  return (
    <div className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); hasBreakdown && setOpen(o => !o); }}
        className={`tabular-nums text-zinc-300 font-medium ${hasBreakdown ? "cursor-pointer hover:text-white" : ""}`}
      >
        {velocity.toFixed(1)}{hasBreakdown && <span className="text-zinc-600 text-[9px] ml-0.5">▾</span>}
      </button>
      {open && hasBreakdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-bg-card border border-bg-border rounded-lg shadow-xl p-2 min-w-[130px] text-xs">
            {Object.entries(byMarket).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).map(([mp, v]) => (
              <div key={mp} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-zinc-400">{MP_FLAG[mp] ?? mp} {mp}</span>
                <span className="font-mono text-zinc-200">{v.toFixed(1)}/gg</span>
              </div>
            ))}
            <div className="border-t border-bg-border mt-1 pt-1 flex justify-between font-semibold">
              <span className="text-zinc-400">Totale EU</span>
              <span className="text-white">{velocity.toFixed(1)}/gg</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inbound detail ───────────────────────────────────────────────────────────

function InboundCell({ item }: { item: FbaItem }) {
  if (item.inboundQuantity === 0) return <span className="text-zinc-700">—</span>;
  return (
    <div className="text-right">
      <span className="text-purple-400 font-semibold tabular-nums">{fmtN(item.inboundQuantity)}</span>
      <div className="text-[9px] text-zinc-600 space-x-1 tabular-nums">
        {item.inboundReceiving > 0 && <span>📥{item.inboundReceiving}</span>}
        {item.inboundShipped   > 0 && <span>🚚{item.inboundShipped}</span>}
        {item.inboundWorking   > 0 && <span>📦{item.inboundWorking}</span>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items,        setItems]        = useState<FbaItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mpFilter,     setMpFilter]     = useState<string>("all");
  const [sortKey,      setSortKey]      = useState<SortKey>("qty");
  const [sortAsc,      setSortAsc]      = useState(false);
  const [syncedAt,     setSyncedAt]     = useState<string | null>(null);
  const [expandedAsin, setExpandedAsin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.amazon.fbaInventory({});
      setItems(res.items ?? []);
      setSyncedAt(res.syncedAt ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Errore caricamento magazzino FBA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const criticalCount      = useMemo(() => items.filter(i => i.status === "critical").length, [items]);
  const lowCount           = useMemo(() => items.filter(i => i.status === "low").length, [items]);
  const panEuCount         = useMemo(() => items.filter(i => i.isPanEu).length, [items]);
  const totalFulfillable   = useMemo(() => items.reduce((s, i) => s + i.fulfillableQuantity, 0), [items]);
  const totalInbound       = useMemo(() => items.reduce((s, i) => s + i.inboundQuantity, 0), [items]);
  const totalUnfulfillable = useMemo(() => items.reduce((s, i) => s + i.unfulfillableQuantity, 0), [items]);
  const totalResearching   = useMemo(() => items.reduce((s, i) => s + i.researchingQuantity, 0), [items]);
  const allMps             = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => i.marketplaces.forEach(mp => set.add(mp)));
    return [...set].sort();
  }, [items]);

  // ── Apply filter click: set filter + best sort ─────────────────────────────
  function applyFilter(f: StatusFilter) {
    setStatusFilter(prev => {
      if (prev === f) { setSortKey("qty"); setSortAsc(false); return "all"; }
      if (f === "damaged") { setSortKey("damaged"); setSortAsc(false); }
      else if (f === "lost")    { setSortKey("lost");    setSortAsc(false); }
      else if (f === "inbound") { setSortKey("inbound"); setSortAsc(false); }
      else if (f === "critical" || f === "low") { setSortKey("days"); setSortAsc(true); }
      else { setSortKey("qty"); setSortAsc(false); }
      return f;
    });
    setExpandedAsin(null);
  }

  // ── Filter + sort (FIX: all deps included) ─────────────────────────────────
  const filtered = useMemo(() => {
    let list = items.filter(item => {
      if (statusFilter === "available" && item.fulfillableQuantity === 0) return false;
      if (statusFilter === "critical"  && item.status !== "critical")     return false;
      if (statusFilter === "low"       && !["critical","low"].includes(item.status)) return false;
      if (statusFilter === "inbound"   && item.inboundQuantity === 0)     return false;
      if (statusFilter === "damaged"   && item.unfulfillableQuantity === 0) return false;
      if (statusFilter === "lost"      && item.researchingQuantity === 0) return false;
      if (mpFilter !== "all"           && !item.marketplaces.includes(mpFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.asin?.toLowerCase().includes(q) &&
            !item.sellerSku?.toLowerCase().includes(q) &&
            !item.productName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "qty":     diff = b.fulfillableQuantity  - a.fulfillableQuantity;  break;
        case "days":
          if (a.daysRemaining === null && b.daysRemaining === null) diff = 0;
          else if (a.daysRemaining === null) diff = 1;
          else if (b.daysRemaining === null) diff = -1;
          else diff = a.daysRemaining - b.daysRemaining;
          break;
        case "velocity": diff = b.salesVelocity      - a.salesVelocity;        break;
        case "damaged":  diff = b.unfulfillableQuantity - a.unfulfillableQuantity; break;
        case "lost":     diff = b.researchingQuantity - a.researchingQuantity;  break;
        case "inbound":  diff = b.inboundQuantity     - a.inboundQuantity;      break;
        case "asin":     diff = (a.asin||"").localeCompare(b.asin||"");         break;
      }
      return sortAsc ? -diff : diff;
    });

    return list;
  // FIX: mpFilter was missing from deps — caused filter to not react
  }, [items, statusFilter, mpFilter, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ k, label, right }: { k: SortKey; label: string; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-3 py-3 text-[10px] font-medium uppercase tracking-wide cursor-pointer select-none transition-colors whitespace-nowrap ${right ? "text-right" : "text-left"} ${active ? "text-accent-primary" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <span className={`inline-flex items-center gap-0.5 ${right ? "justify-end w-full" : ""}`}>
          {label}
          {active ? (sortAsc ? <ChevronUp size={10}/> : <ChevronDown size={10}/>) : null}
        </span>
      </th>
    );
  }

  // ── Active filter label ────────────────────────────────────────────────────
  const filterLabel: Record<StatusFilter, string> = {
    all: "", available: "Disponibili", critical: "Critici (≤7gg)",
    low: "Scorte basse (≤30gg)", inbound: "In arrivo", damaged: "Danneggiati", lost: "Persi/In investigazione",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Magazzino FBA</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Inventario live · deduplicato PAN-EU · dati reali Amazon
            {syncedAt && <span className="ml-2 text-zinc-600">· sync {new Date(syncedAt).toLocaleTimeString("it-IT")}</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── KPI cards — tutti cliccabili dove rilevante ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {([
          { label: "SKU unici",   value: items.length,       color: "text-zinc-300",    icon: Package,       sub: panEuCount > 0 ? `${panEuCount} PAN-EU` : undefined,  filter: undefined        },
          { label: "Disponibile", value: totalFulfillable,   color: "text-emerald-400", icon: Package,       sub: "unità spedibili · clicca",                           filter: "available" as StatusFilter },
          { label: "In arrivo",   value: totalInbound,       color: "text-purple-400",  icon: Truck,         sub: "in shipment · clicca",                               filter: "inbound"   as StatusFilter },
          { label: "Riservato",   value: items.reduce((s,i) => s + i.reservedQuantity, 0), color: "text-zinc-400", icon: Lock, sub: "ordini in corso",                  filter: undefined        },
          { label: "Danneggiato", value: totalUnfulfillable, color: "text-amber-400",   icon: Wrench,        sub: "non vendibile · clicca per lista",                   filter: "damaged"   as StatusFilter },
          { label: "Perso",       value: totalResearching,   color: "text-red-400",     icon: TrendingDown,  sub: "in investigazione · clicca per lista",               filter: "lost"      as StatusFilter },
          { label: "Critici",     value: criticalCount,      color: criticalCount > 0 ? "text-red-400" : "text-zinc-600", icon: AlertTriangle, sub: `${lowCount} bassi · clicca`, filter: "critical" as StatusFilter },
        ] as const).map(({ label, value, color, icon: Icon, sub, filter }) => {
          const active    = filter !== undefined && statusFilter === filter;
          const clickable = filter !== undefined;
          return (
            <div key={label}
              onClick={() => clickable && applyFilter(filter!)}
              className={`rounded-xl p-4 transition-all ${clickable ? "cursor-pointer" : ""} ${
                active
                  ? "bg-accent-primary/8 border-2 border-accent-primary/40 ring-1 ring-accent-primary/15"
                  : "bg-bg-card border border-bg-border hover:border-accent-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon size={12} className={color} />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
                {active && <X size={9} className="ml-auto text-accent-primary/60" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{fmtN(value)}</div>
              {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
            </div>
          );
        })}
      </div>

      {/* ── Alert banners ── */}
      {!loading && (criticalCount > 0 || lowCount > 0 || totalUnfulfillable > 0 || totalResearching > 0) && (
        <div className="flex flex-wrap gap-2">
          {criticalCount > 0 && (
            <button onClick={() => applyFilter("critical")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-red-400 transition-colors border ${statusFilter === "critical" ? "bg-red-500/20 border-red-500/40 font-semibold" : "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"}`}>
              <AlertTriangle size={13} />
              <strong>{criticalCount}</strong> prodotti critici — riordino urgente (≤7 giorni)
            </button>
          )}
          {lowCount > 0 && (
            <button onClick={() => applyFilter("low")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-amber-400 transition-colors border ${statusFilter === "low" ? "bg-amber-500/20 border-amber-500/40 font-semibold" : "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15"}`}>
              <AlertTriangle size={13} />
              <strong>{lowCount}</strong> prodotti con scorte basse (≤30 giorni)
            </button>
          )}
          {totalUnfulfillable > 0 && (
            <button onClick={() => applyFilter("damaged")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-orange-400 transition-colors border ${statusFilter === "damaged" ? "bg-orange-500/20 border-orange-500/40 font-semibold" : "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15"}`}>
              <Wrench size={13} />
              <strong>{totalUnfulfillable}</strong> unità danneggiate/invendibili
            </button>
          )}
          {totalResearching > 0 && (
            <button onClick={() => applyFilter("lost")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-red-400 transition-colors border ${statusFilter === "lost" ? "bg-red-500/20 border-red-500/40 font-semibold" : "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"}`}>
              <TrendingDown size={13} />
              <strong>{totalResearching}</strong> unità perse / in investigazione
            </button>
          )}
        </div>
      )}

      {/* ── PAN-EU info ── */}
      {!loading && panEuCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs text-blue-300/80">
          <Globe2 size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-blue-400">{panEuCount} prodotti PAN-EU</strong> — magazzino fisico condiviso tra IT, DE, FR, ES.
            Le unità mostrate sono quelle reali (deduplicate). La velocità di vendita somma tutti i marketplace EU.
          </span>
        </div>
      )}

      {/* ── Search + status filter ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-bg-card border border-bg-border rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-[280px]">
            <SearchIcon size={13} className="text-zinc-500 shrink-0" />
            <input type="text" placeholder="ASIN, SKU, nome…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 outline-none w-full" />
            {search && <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-400">✕</button>}
          </div>
          {/* Status pills */}
          <div className="flex gap-1 flex-wrap">
            {([
              { k: "all",       emoji: "",   label: `Tutti`,                    count: items.length        },
              { k: "available", emoji: "✅", label: `Disponibili`,              count: items.filter(i => i.fulfillableQuantity > 0).length },
              { k: "critical",  emoji: "🔴", label: `Critici`,                  count: criticalCount       },
              { k: "low",       emoji: "🟡", label: `Bassi`,                    count: lowCount            },
              { k: "inbound",   emoji: "📥", label: `In arrivo`,                count: items.filter(i => i.inboundQuantity > 0).length },
              { k: "damaged",   emoji: "⚠️", label: `Danneggiati`,              count: totalUnfulfillable  },
              { k: "lost",      emoji: "🔍", label: `Persi`,                    count: totalResearching    },
            ] as const).map(({ k, emoji, label, count }) => (
              <button key={k} onClick={() => applyFilter(k as StatusFilter)}
                className={`px-3 py-1.5 text-[11px] rounded-lg border font-medium transition-colors ${
                  statusFilter === k
                    ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
                    : "bg-bg-card border-bg-border text-zinc-400 hover:text-white"
                }`}>
                {emoji} {label} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-600 ml-auto tabular-nums">{filtered.length} di {items.length} SKU</span>
        </div>

        {/* Marketplace filter */}
        {allMps.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium shrink-0 w-10">Paese</span>
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setMpFilter("all")}
                className={`px-3 py-1 text-[11px] rounded-lg border font-medium transition-colors ${
                  mpFilter === "all" ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-bg-card border-bg-border text-zinc-400 hover:text-white"
                }`}>🌐 Tutti</button>
              {allMps.map(mp => {
                const cnt = items.filter(i => i.marketplaces.includes(mp)).length;
                return (
                  <button key={mp} onClick={() => setMpFilter(mpFilter === mp ? "all" : mp)}
                    className={`px-3 py-1 text-[11px] rounded-lg border font-medium transition-colors ${
                      mpFilter === mp ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-bg-card border-bg-border text-zinc-400 hover:text-white"
                    }`}>
                    {MP_FLAG[mp] ?? mp} {mp} <span className="opacity-50">({cnt})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Active filter banner */}
        {statusFilter !== "all" && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary/5 border border-accent-primary/15 rounded-lg text-xs">
            <BarChart3 size={11} className="text-accent-primary" />
            <span className="text-accent-primary font-medium">Filtro: {filterLabel[statusFilter]}</span>
            <span className="text-zinc-500">· {filtered.length} prodotti · ordinati per {
              sortKey === "qty" ? "unità disponibili" : sortKey === "days" ? "giorni rimanenti" :
              sortKey === "damaged" ? "unità danneggiate" : sortKey === "lost" ? "unità perse" :
              sortKey === "inbound" ? "unità in arrivo" : "velocità"
            } ↓</span>
            <button onClick={() => applyFilter("all")} className="ml-auto flex items-center gap-1 text-zinc-500 hover:text-white transition-colors">
              <X size={11} /> Rimuovi filtro
            </button>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
          <strong>Errore API FBA:</strong> {error}
        </div>
      )}

      {/* ── Main table ── */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="border-b border-bg-border bg-bg-hover">
                <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[10px] w-[280px]">Prodotto / ASIN</th>
                <th className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide text-[10px]">Mercati</th>
                <SortTh k="qty"      label="Disponibile"  right />
                <SortTh k="inbound"  label="In arrivo"    right />
                <th className="px-3 py-3 text-right text-zinc-500 font-medium uppercase tracking-wide text-[10px]">Riservato</th>
                <SortTh k="damaged"  label="Danneggiato"  right />
                <SortTh k="lost"     label="Perso"        right />
                <SortTh k="velocity" label="Vel/gg EU"    right />
                <SortTh k="days"     label="Scorta"             />
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/40">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-3 bg-bg-border rounded animate-pulse" style={{ width: j === 0 ? "80%" : "50%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-zinc-600">
                      <Package size={28} className="opacity-30" />
                      <span className="text-sm">
                        {items.length === 0
                          ? "Nessun prodotto FBA trovato. Verifica la connessione SP-API."
                          : "Nessun prodotto corrisponde ai filtri selezionati"}
                      </span>
                      {statusFilter !== "all" && (
                        <button onClick={() => applyFilter("all")} className="text-xs text-accent-primary hover:underline">
                          Rimuovi filtro →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const hasIssue  = item.unfulfillableQuantity > 0 || item.researchingQuantity > 0;
                  const isExpanded = expandedAsin === item.asin;
                  const rowBg = item.status === "critical" ? "bg-red-500/3 hover:bg-red-500/6"
                              : item.status === "low"      ? "bg-amber-500/3 hover:bg-amber-500/6"
                              : hasIssue                   ? "bg-orange-500/3 hover:bg-orange-500/6"
                              : "hover:bg-bg-hover";

                  return (
                    // FIX: usa React.Fragment con key invece di <> senza key — React non aggiornava il DOM
                    <React.Fragment key={item.fnSku || item.asin}>
                      <tr
                        className={`transition-colors cursor-pointer ${rowBg}`}
                        onClick={() => setExpandedAsin(isExpanded ? null : item.asin)}
                      >
                        {/* Product */}
                        <td className="px-4 py-3 w-[280px]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-lg object-contain bg-bg-hover shrink-0 border border-bg-border" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-bg-hover flex items-center justify-center shrink-0 border border-bg-border">
                                <span className="text-zinc-600 text-[9px] font-mono">{item.asin.slice(0, 4)}</span>
                              </div>
                            )}
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-zinc-200 text-[11px] font-medium truncate leading-tight" title={item.productName}>
                                {item.productName || "—"}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-zinc-600 font-mono text-[9px]">{item.asin}</span>
                                {item.sellerSku && <span className="text-zinc-700 text-[9px] truncate">· {item.sellerSku}</span>}
                              </div>
                            </div>
                            <ChevronDown size={12} className={`text-zinc-600 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </td>

                        {/* Marketplaces */}
                        <td className="px-3 py-3">
                          <MpBadges marketplaces={item.marketplaces} isPanEu={item.isPanEu} />
                        </td>

                        {/* Disponibile — colonna principale, numero grande e colorato */}
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`tabular-nums font-bold text-sm ${
                              item.fulfillableQuantity === 0 ? "text-zinc-600" :
                              item.status === "critical"    ? "text-red-400" :
                              item.status === "low"         ? "text-amber-400" : "text-emerald-400"
                            }`}>
                              {fmtN(item.fulfillableQuantity)}
                            </span>
                            <span className="text-[9px] text-zinc-600">unità</span>
                          </div>
                        </td>

                        {/* In arrivo */}
                        <td className="px-3 py-3 text-right">
                          <InboundCell item={item} />
                        </td>

                        {/* Riservato */}
                        <td className="px-3 py-3 text-right">
                          {item.reservedQuantity > 0
                            ? <span className="text-zinc-400 tabular-nums">{fmtN(item.reservedQuantity)}</span>
                            : <span className="text-zinc-700">—</span>}
                        </td>

                        {/* Danneggiato — evidenziato se > 0 */}
                        <td className="px-3 py-3 text-right">
                          {item.unfulfillableQuantity > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-amber-400 font-bold tabular-nums">{fmtN(item.unfulfillableQuantity)}</span>
                              <span className="text-[9px] text-amber-600">invendibile</span>
                            </div>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>

                        {/* Perso — evidenziato se > 0 */}
                        <td className="px-3 py-3 text-right">
                          {item.researchingQuantity > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-red-400 font-bold tabular-nums">{fmtN(item.researchingQuantity)}</span>
                              <span className="text-[9px] text-red-600">ricerca</span>
                            </div>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>

                        {/* Velocity */}
                        <td className="px-3 py-3 text-right">
                          <VelocityCell velocity={item.salesVelocity} byMarket={item.salesVelocityByMarket} />
                        </td>

                        {/* Scorta (status pill + bar) */}
                        <td className="px-3 py-3 w-[140px]">
                          <div className="space-y-1.5">
                            <StatusPill status={item.status} daysRemaining={item.daysRemaining} />
                            <StockBar days={item.daysRemaining} />
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded row ── */}
                      {isExpanded && (
                        <tr className="bg-bg-hover">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">

                              {/* Stock breakdown */}
                              <div className="space-y-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Dettaglio scorte</div>
                                {[
                                  { label: "Disponibile (FBA)", val: item.fulfillableQuantity,  color: "text-emerald-400" },
                                  { label: "In lavorazione",    val: item.inboundWorking,        color: "text-purple-300"  },
                                  { label: "Spedito verso AMZ", val: item.inboundShipped,        color: "text-purple-400"  },
                                  { label: "In ricezione",      val: item.inboundReceiving,      color: "text-purple-500"  },
                                  { label: "Riservato",         val: item.reservedQuantity,      color: "text-zinc-400"    },
                                ].map(({ label, val, color }) => (
                                  <div key={label} className="flex items-center justify-between">
                                    <span className="text-zinc-500">{label}</span>
                                    <span className={`tabular-nums font-semibold ${color}`}>{fmtN(val)}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Problemi */}
                              <div className="space-y-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Problemi qualità</div>
                                {[
                                  { label: "Danneg. cliente",  val: item.customerDamaged,     color: "text-amber-400"  },
                                  { label: "Danneg. magaz.",   val: item.warehouseDamaged,    color: "text-amber-400"  },
                                  { label: "Difettoso",        val: item.defective,           color: "text-orange-400" },
                                  { label: "Scaduto",          val: item.expired,             color: "text-red-400"    },
                                  { label: "Perso/Ricerca",    val: item.researchingQuantity, color: "text-red-400"    },
                                ].map(({ label, val, color }) => (
                                  <div key={label} className="flex items-center justify-between">
                                    <span className="text-zinc-500">{label}</span>
                                    <span className={`tabular-nums font-semibold ${val > 0 ? color : "text-zinc-700"}`}>{fmtN(val)}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Velocità per marketplace */}
                              <div className="space-y-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Velocità vendita 30gg</div>
                                {Object.entries(item.salesVelocityByMarket)
                                  .filter(([, v]) => v > 0)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([mp, v]) => (
                                    <div key={mp} className="flex items-center justify-between">
                                      <span className="text-zinc-500">{MP_FLAG[mp] ?? mp} {mp}</span>
                                      <span className="tabular-nums text-zinc-200 font-semibold">{v.toFixed(2)}/gg</span>
                                    </div>
                                  ))}
                                <div className="border-t border-bg-border pt-1 flex justify-between font-bold">
                                  <span className="text-zinc-400">Totale EU</span>
                                  <span className="text-white">{item.salesVelocity.toFixed(2)}/gg</span>
                                </div>
                              </div>

                              {/* Previsioni */}
                              <div className="space-y-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Previsioni</div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">Scorta attuale</span>
                                  <span className="tabular-nums text-white font-bold">{fmtN(item.fulfillableQuantity)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">+ In arrivo</span>
                                  <span className="tabular-nums text-purple-400 font-semibold">{fmtN(item.inboundQuantity)}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-bg-border pt-1">
                                  <span className="text-zinc-500">= Totale previsto</span>
                                  <span className="tabular-nums text-zinc-200 font-bold">{fmtN(item.fulfillableQuantity + item.inboundQuantity)}</span>
                                </div>
                                {item.salesVelocity > 0 && (
                                  <>
                                    <div className="flex items-center justify-between border-t border-bg-border pt-1">
                                      <span className="text-zinc-500">Scorta att. dura</span>
                                      <span className={`tabular-nums font-bold ${(item.daysRemaining ?? 999) <= 7 ? "text-red-400" : (item.daysRemaining ?? 999) <= 30 ? "text-amber-400" : "text-emerald-400"}`}>
                                        {item.daysRemaining !== null ? `${item.daysRemaining} gg` : "—"}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-zinc-500">Con inbound dura</span>
                                      <span className="tabular-nums text-zinc-300 font-semibold">
                                        {Math.round((item.fulfillableQuantity + item.inboundQuantity) / item.salesVelocity)} gg
                                      </span>
                                    </div>
                                  </>
                                )}
                                <div className="flex items-center justify-between border-t border-bg-border pt-1">
                                  <span className="text-zinc-600">fnSku</span>
                                  <span className="tabular-nums text-zinc-700 font-mono text-[9px]">{item.fnSku}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-bg-border flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
            <div className="flex flex-wrap gap-4">
              <span><span className="text-blue-400 font-medium">PAN-EU</span> = stock fisico unico condiviso su IT, DE, FR, ES — deduplicato</span>
              <span>Vel. = unità/giorno media 30gg · somma tutti i marketplace</span>
              <span>Clicca una riga per il dettaglio · clicca una card KPI per filtrare</span>
            </div>
            <span className="tabular-nums">{filtered.length} / {items.length} SKU</span>
          </div>
        )}
      </div>
    </div>
  );
}
