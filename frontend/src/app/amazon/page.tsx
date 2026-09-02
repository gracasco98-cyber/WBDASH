"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, AmazonOverview, AmazonSummary, TimePoint, AmazonProduct, AmazonDashboardResponse, AmazonDashboardInFlightRow, AmazonDashboardLastSettlement } from "@/lib/api";
import AmazonOverviewCards from "@/components/amazon/AmazonOverviewCards";
import AmazonRevenueChart from "@/components/amazon/AmazonRevenueChart";
import AmazonMarketplaceTable from "@/components/amazon/AmazonMarketplaceTable";
import SellerboardKpiCards from "@/components/dashboard/SellerboardKpiCards";
import OverviewViewTabs, { DashboardView } from "@/components/dashboard/OverviewViewTabs";
import {
  RefreshCw, Search, ChevronUp, ChevronDown,
  Package, ArrowUpDown,
  Calendar, SlidersHorizontal, ExternalLink,
} from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import { getDateRangeForPreset } from "@/lib/periodUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "today" | "yesterday" | "last7" | "last30" | "last90" | "month" | "custom";

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "Ultimi 7gg" },
  { value: "last30", label: "Ultimi 30gg" },
  { value: "last90", label: "Ultimi 90gg" },
  { value: "month", label: "Mese corrente" },
  { value: "custom", label: "Personalizzato" },
];

const MARKETPLACES: Array<{ value: string; flag?: string; label: string }> = [
  { value: "all",  label: "Tutti" },
  { value: "IT",   flag: "it", label: "IT" },
  { value: "DE",   flag: "de", label: "DE" },
  { value: "ES",   flag: "es", label: "ES" },
  { value: "FR",   flag: "fr", label: "FR" },
  { value: "UK",   flag: "gb", label: "UK" },
  { value: "US",   flag: "us", label: "US" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MP_DOMAIN: Record<string, string> = {
  IT: "amazon.it",
  DE: "amazon.de",
  FR: "amazon.fr",
  ES: "amazon.es",
  UK: "amazon.co.uk",
  SE: "amazon.se",
  PL: "amazon.pl",
  BE: "amazon.com.be",
  NL: "amazon.nl",
};

function amazonUrl(asin: string, marketplace: string): string {
  const domain = MP_DOMAIN[marketplace] ?? "amazon.it";
  return `https://www.${domain}/dp/${asin}`;
}

// ─── Products table ───────────────────────────────────────────────────────────

type SortKey = "grossRevenue" | "netRevenue" | "unitsSold" | "orderCount" | "adSpend" | "avgUnitPrice";

function ProductsTable({ products, loading }: { products: AmazonProduct[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("grossRevenue");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [realImages, setRealImages] = useState<Record<string, string>>({});
  const PAGE_SIZE = 20;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  };

  // Reset page on new data
  useEffect(() => { setPage(0); }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .filter(p =>
        !q ||
        (p.productTitle ?? "").toLowerCase().includes(q) ||
        (p.asin ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const diff = ((a as any)[sortKey] ?? 0) - ((b as any)[sortKey] ?? 0);
        return sortAsc ? diff : -diff;
      });
  }, [products, search, sortKey, sortAsc]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Fetch real catalog image URLs — only for current page ASINs (cached 24h on backend)
  useEffect(() => {
    if (!paginated.length) return;
    const pageAsins = [...new Set(paginated.map(p => p.asin))];
    // Skip ASINs we already have
    const missing = pageAsins.filter(a => !(a in realImages));
    if (!missing.length) return;
    api.amazon.catalogImages(missing).then(map => {
      setRealImages(prev => {
        const next = { ...prev };
        for (const [asin, url] of Object.entries(map)) {
          if (url) next[asin] = url;
          else if (!(asin in next)) next[asin] = "";  // mark as checked, no image
        }
        return next;
      });
    }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, products]);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase tracking-wide font-medium transition-colors"
    >
      {label}
      {sortKey === k
        ? (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
        : <ArrowUpDown size={9} className="opacity-40" />}
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-1 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="h-8 w-8 bg-bg-border rounded animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-48 bg-bg-border rounded animate-pulse" />
              <div className="h-2 w-24 bg-bg-border/60 rounded animate-pulse" />
            </div>
            <div className="h-4 w-20 bg-bg-border rounded animate-pulse" />
            <div className="h-4 w-16 bg-bg-border rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-14 text-center">
        <Package size={28} className="mx-auto mb-3 text-zinc-700" />
        <div className="text-zinc-500 text-sm">Nessun prodotto venduto in questo periodo</div>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <Search size={13} className="text-zinc-500 shrink-0" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Cerca per titolo, ASIN o SKU…"
          className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
        )}
        <span className="text-[10px] text-zinc-600 ml-2 shrink-0">{filtered.length} prodotti</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-bg-border/40 bg-bg-base/20 text-right">
        <div className="flex-1 text-[10px] text-zinc-600 uppercase tracking-wide text-left">Prodotto</div>
        <div className="w-[80px]"><SortBtn k="unitsSold" label="Unità" /></div>
        <div className="w-[90px]"><SortBtn k="orderCount" label="Ordini" /></div>
        <div className="w-[110px]"><SortBtn k="grossRevenue" label="Lordo" /></div>
        <div className="w-[100px]"><SortBtn k="netRevenue" label="Netto" /></div>
        <div className="w-[90px] hidden md:block"><SortBtn k="adSpend" label="PPC" /></div>
        <div className="w-[80px] hidden lg:block"><SortBtn k="avgUnitPrice" label="Prezzo" /></div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-bg-border/20">
        {paginated.map((p, i) => {
          const marginPct = p.grossRevenue > 0 ? (p.netRevenue / p.grossRevenue) * 100 : 0;
          const mpForUrl = p.marketplace && p.marketplace !== "all" ? p.marketplace : "IT";
          const listingUrl = p.asin ? amazonUrl(p.asin, mpForUrl) : null;
          return (
            <div key={`${p.asin}-${p.marketplace}-${i}`}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-bg-hover/30 transition-colors">
              {/* Image + title */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {/* Clickable image */}
                {listingUrl ? (
                  <a href={listingUrl} target="_blank" rel="noopener noreferrer"
                    title="Apri su Amazon"
                    className="shrink-0 group relative w-8 h-8">
                    {realImages[p.asin] ? (
                      <img
                        src={realImages[p.asin]}
                        alt=""
                        className="w-8 h-8 rounded object-contain bg-zinc-800 group-hover:ring-1 group-hover:ring-accent-primary/50 transition-all"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                        <Package size={12} className="text-zinc-600" />
                      </div>
                    )}
                    <ExternalLink size={8} className="absolute -top-1 -right-1 text-accent-primary opacity-0 group-hover:opacity-100 transition-opacity bg-bg-card rounded" />
                  </a>
                ) : (
                  <div className="shrink-0 w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                    {realImages[p.asin] ? (
                      <img src={realImages[p.asin]} alt="" className="w-8 h-8 rounded object-contain"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Package size={12} className="text-zinc-600" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {/* Clickable title */}
                  {listingUrl ? (
                    <a href={listingUrl} target="_blank" rel="noopener noreferrer"
                      title={p.productTitle ?? ""}
                      className="block text-xs text-zinc-200 hover:text-accent-primary transition-colors leading-tight truncate max-w-[220px]">
                      {p.productTitle ?? "—"}
                    </a>
                  ) : (
                    <div className="text-xs text-zinc-200 truncate leading-tight max-w-[220px]">{p.productTitle ?? "—"}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[9px] text-zinc-600 font-mono">{p.asin}</span>
                    {p.sku && <span className="text-[9px] text-zinc-700 truncate max-w-[80px]">· {p.sku}</span>}
                    {p.marketplace && p.marketplace !== "all" && (
                      <span className="text-[9px] bg-zinc-800 text-zinc-500 rounded px-1">{p.marketplace}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-[80px] text-right">
                <span className="text-xs font-medium text-zinc-300 tabular-nums">{fmtNum(p.unitsSold)}</span>
              </div>
              <div className="w-[90px] text-right">
                <span className="text-xs text-zinc-500 tabular-nums">{fmtNum(p.orderCount)}</span>
              </div>
              <div className="w-[110px] text-right">
                <span className="text-xs font-medium text-white tabular-nums">{fmtEur(p.grossRevenue)}</span>
              </div>
              <div className="w-[100px] text-right">
                <span className={`text-xs font-semibold tabular-nums ${marginPct >= 30 ? "text-emerald-400" : marginPct >= 15 ? "text-blue-400" : "text-orange-400"
                  }`}>{fmtEur(p.netRevenue)}</span>
                <div className="text-[9px] text-zinc-600">{marginPct.toFixed(0)}%</div>
              </div>
              <div className="w-[90px] text-right hidden md:block">
                {p.adSpend > 0
                  ? <span className="text-xs text-purple-400 tabular-nums">{fmtEur(p.adSpend)}</span>
                  : <span className="text-[10px] text-zinc-700">—</span>}
              </div>
              <div className="w-[80px] text-right hidden lg:block">
                <span className="text-xs text-zinc-500 tabular-nums">{fmtEur(p.avgUnitPrice, 2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-bg-border">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 text-xs rounded-lg border border-bg-border text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">←</button>
          <span className="text-xs text-zinc-500">Pag. {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="px-3 py-1 text-xs rounded-lg border border-bg-border text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">→</button>
        </div>
      )}
    </div>
  );
}

// ─── Settlement / Riserva widget ─────────────────────────────────────────────

// ISO code (lowercase) for /images/flags/*.png
const MP_FLAG: Record<string, string> = {
  IT: "it", DE: "de", FR: "fr", ES: "es", UK: "gb", US: "us", PL: "pl", CH: "ch",
};
function MpFlag({ mp }: { mp: string }) {
  const code = MP_FLAG[mp];
  if (!code) return <span className="text-lg shrink-0">🌍</span>;
  return (
    <img src={`/images/flags/${code}.png`} alt={mp}
      style={{ width: 22, height: 16, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

// Mini waterfall row: label + bar + amount
function WaterfallRow({ label, amount, total, color, sign = "-" }: {
  label: string; amount: number; total: number; color: string; sign?: "+" | "-";
}) {
  const pct = total > 0 ? Math.min(100, (Math.abs(amount) / total) * 100) : 0;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px]">
      <div className="w-full sm:w-28 text-zinc-600 shrink-0 truncate">{label}</div>
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 bg-bg-border/40 rounded-full h-1 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
        <div className={`w-20 text-right tabular-nums font-medium ${sign === "-" ? "text-red-400/80" : "text-emerald-400"}`}>
          {sign}{fmtEur(Math.abs(amount))}
        </div>
      </div>
    </div>
  );
}

function SettlementWidget({ dashData, loading }: { dashData: AmazonDashboardResponse | null; loading: boolean }) {
  const [tab, setTab] = useState<"riserva" | "overdue" | "next" | "storico">("riserva");
  const [expandedMp, setExpand] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden animate-pulse">
        <div className="px-4 py-3.5 border-b border-bg-border h-14 bg-bg-border/20" />
        <div className="p-4 flex gap-6">
          <div className="h-10 w-28 bg-bg-border rounded" />
          <div className="h-10 w-28 bg-bg-border rounded" />
          <div className="h-10 w-28 bg-bg-border rounded" />
        </div>
      </div>
    );
  }

  if (!dashData) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl px-4 py-6 text-center text-zinc-600 text-xs">
        Nessun dato settlement disponibile
      </div>
    );
  }

  const { inFlight, overdue, lastSettlements, accountSummary } = dashData;
  const hasOverdue = overdue.count > 0;

  const tabs: Array<{ key: "riserva" | "overdue" | "next" | "storico"; label: string }> = [
    { key: "riserva", label: `Riserva (${fmtNum(inFlight.count)} ord.)` },
    { key: "next", label: "Prossimi pagamenti" },
    { key: "storico", label: "Storico fee" },
    ...(hasOverdue ? [{ key: "overdue" as const, label: `Anomalie (${overdue.count})` }] : []),
  ];

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      {/* ── Header with totals ── */}
      <div className="px-4 py-3.5 border-b border-bg-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-white">💳 Situazione Pagamenti Amazon</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Saldo venditore · fee detratte · riserva in transito</p>
          </div>
          {/* Waterfall summary KPIs */}
          <div className="flex items-center gap-0 text-xs divide-x divide-bg-border">
            <div className="px-4 first:pl-0 text-center">
              <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Venduto lordo</div>
              <div className="font-bold text-white tabular-nums">{fmtEur(inFlight.totalGross)}</div>
              <div className="text-[9px] text-zinc-600">in attesa</div>
            </div>
            <div className="px-4 text-center">
              <div className="text-[9px] text-red-500/80 uppercase tracking-widest mb-0.5">âˆ’ Fee stimate</div>
              <div className="font-bold text-red-400/80 tabular-nums">âˆ’{fmtEur(inFlight.totalEstFees)}</div>
              <div className="text-[9px] text-zinc-600">Amazon trattiene</div>
            </div>
            <div className="px-4 text-center">
              <div className="text-[9px] text-emerald-500 uppercase tracking-widest mb-0.5">= Netto atteso</div>
              <div className="font-bold text-emerald-400 tabular-nums">{fmtEur(inFlight.totalEstNet)}</div>
              <div className="text-[9px] text-zinc-600">bonifico stimato</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-bg-border px-4 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key
              ? "border-accent-primary text-accent-primary"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ══ TAB: RISERVA ══ */}
        {tab === "riserva" && (
          <div className="space-y-3">
            <p className="text-[11px] text-zinc-600">
              Ordini spediti negli <strong className="text-zinc-400">ultimi 28 giorni</strong> non ancora liquidati.
              È normale: Amazon paga con 8-14 giorni di ritardo.
              Il <strong className="text-zinc-400">netto stimato</strong> è calcolato detraendo tutte le fee Amazon
              (referral, FBA, ads, storage…) dal lordo, usando i ratio storici del tuo account.
            </p>

            {inFlight.byMarketplace.map((mp: AmazonDashboardInFlightRow) => {
              const isOpen = expandedMp === mp.marketplace;
              const fb = mp.feeBreakdown;
              const totalFees = mp.grossAmount - mp.estNetAmount;

              return (
                <div key={mp.marketplace} className="bg-bg-base/50 border border-bg-border/60 rounded-xl overflow-hidden">
                  {/* Row header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-hover/20 transition-colors text-left"
                    onClick={() => setExpand(isOpen ? null : mp.marketplace)}
                  >
                    <MpFlag mp={mp.marketplace} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-100">{mp.marketplace}</span>
                        <span className="text-[10px] text-zinc-600">{fmtNum(mp.count)} ordini</span>
                      </div>
                      {/* Mini fee bar */}
                      <div className="flex h-1.5 mt-1.5 rounded-full overflow-hidden gap-px w-full max-w-[200px]">
                        <div className="bg-emerald-500/60" style={{ width: `${mp.payoutRatioPct}%` }} title={`Netto ${mp.payoutRatioPct}%`} />
                        <div className="bg-blue-500/50" style={{ width: `${fb.commissionPct}%` }} title={`Commission ${fb.commissionPct}%`} />
                        <div className="bg-orange-500/50" style={{ width: `${fb.fbaPct}%` }} title={`FBA ${fb.fbaPct}%`} />
                        <div className="bg-purple-500/50" style={{ width: `${fb.adsPct}%` }} title={`Ads ${fb.adsPct}%`} />
                        <div className="bg-zinc-500/40 flex-1" title="Altre fee" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400 tabular-nums">{fmtEur(mp.grossAmount)} lordo</div>
                      <div className="text-sm font-bold text-emerald-400 tabular-nums">{fmtEur(mp.estNetAmount)} netto</div>
                    </div>
                    <span className="text-zinc-600 text-xs ml-1">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {/* Expanded fee breakdown */}
                  {isOpen && (
                    <div className="border-t border-bg-border/40 px-4 py-3 bg-bg-base/30">
                      <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest mb-2">
                        Dettaglio fee stimate (ratio storico account {mp.marketplace})
                      </div>
                      <div className="space-y-1.5">
                        <WaterfallRow label="Venduto lordo ordini" amount={mp.grossAmount} total={mp.grossAmount} color="bg-zinc-400/30" sign="+" />
                        <WaterfallRow label={`Commissione referral (${fb.commissionPct}%)`} amount={fb.commission} total={mp.grossAmount} color="bg-blue-500/50" />
                        <WaterfallRow label={`FBA fulfillment fee (${fb.fbaPct}%)`} amount={fb.fbaFee} total={mp.grossAmount} color="bg-orange-500/60" />
                        <WaterfallRow label={`PPC / Ads (${fb.adsPct}%)`} amount={fb.adsCost} total={mp.grossAmount} color="bg-purple-500/50" />
                        {fb.adsVat > 0 && <WaterfallRow label="IVA su Ads" amount={fb.adsVat} total={mp.grossAmount} color="bg-purple-400/30" />}
                        {fb.dsf > 0 && <WaterfallRow label="Digital Services Fee" amount={fb.dsf} total={mp.grossAmount} color="bg-zinc-500/40" />}
                        {fb.storage > 0 && <WaterfallRow label="Storage mensile" amount={fb.storage} total={mp.grossAmount} color="bg-zinc-500/40" />}
                        {fb.inbound > 0 && <WaterfallRow label="Inbound trasporto" amount={fb.inbound} total={mp.grossAmount} color="bg-zinc-500/40" />}
                        {fb.prep > 0 && <WaterfallRow label="Prep / Removal" amount={fb.prep} total={mp.grossAmount} color="bg-zinc-500/40" />}
                        {fb.refunds > 0 && <WaterfallRow label="Rimborsi clienti" amount={fb.refunds} total={mp.grossAmount} color="bg-red-500/40" />}
                        {fb.otherCharges > 0 && <WaterfallRow label="Altre voci" amount={fb.otherCharges} total={mp.grossAmount} color="bg-zinc-600/40" />}
                        <div className="border-t border-bg-border/40 pt-1.5 mt-1.5 flex items-center gap-2 text-[10px]">
                          <div className="w-28 text-zinc-500 font-semibold shrink-0">Totale fee detratte</div>
                          <div className="flex-1" />
                          <div className="w-20 text-right font-bold text-red-400/80 tabular-nums">âˆ’{fmtEur(totalFees)}</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <div className="w-28 text-emerald-400 font-bold shrink-0">= Netto atteso</div>
                          <div className="flex-1" />
                          <div className="w-20 text-right font-bold text-emerald-400 tabular-nums">{fmtEur(mp.estNetAmount)}</div>
                        </div>
                        <div className="text-[9px] text-zinc-700 mt-1">
                          Payout ratio storico {mp.marketplace}: <strong className="text-zinc-500">{mp.payoutRatioPct}%</strong> del lordo.
                          {mp.lastSettlementEnd && (
                            <> Copertura fino al {fmtDate(mp.lastSettlementEnd)}
                              {mp.lastSettlementDeposit && `, pagato il ${fmtDate(mp.lastSettlementDeposit)}`}.</>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {inFlight.count === 0 && (
              <div className="py-6 text-center text-zinc-600 text-xs">Nessun ordine recente in attesa</div>
            )}

            <div className="text-[10px] text-zinc-700 border-t border-bg-border/40 pt-2">
              Le fee sono stime basate sui ratio storici del tuo account — corrispondono ai bonifici reali verificati.
              Per il dettaglio ordini vai in{" "}
              <a href="/amazon/payments" className="text-accent-primary/70 hover:text-accent-primary underline">
                Pagamenti → Non Riconciliati
              </a>.
            </div>
          </div>
        )}

        {/* ══ TAB: STORICO FEE ══ */}
        {tab === "storico" && (
          <div>
            <p className="text-[11px] text-zinc-600 mb-3">
              Analisi storica di quanto Amazon ha trattenuto dal tuo venduto lordo (periodo settlement scaricati).
              Usa questi dati per validare la stima del netto atteso sulla riserva.
            </p>

            {/* EU totals */}
            <div className="bg-bg-base/50 rounded-xl border border-bg-border/60 p-4 mb-4">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">Totale EU (tutti i marketplace)</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[9px] text-zinc-600 mb-0.5">Venduto lordo</div>
                  <div className="font-bold text-white tabular-nums">{fmtEur(accountSummary.historicalGross)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-red-500/80 mb-0.5">Fee totali Amazon</div>
                  <div className="font-bold text-red-400/80 tabular-nums">âˆ’{fmtEur(accountSummary.historicalAmazonTake)}</div>
                  <div className="text-[9px] text-zinc-700">
                    {accountSummary.historicalGross > 0
                      ? `${(100 - accountSummary.avgPayoutPct).toFixed(1)}% del lordo`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-emerald-500 mb-0.5">Bonifici reali ricevuti</div>
                  <div className="font-bold text-emerald-400 tabular-nums">{fmtEur(accountSummary.historicalPayout)}</div>
                  <div className="text-[9px] text-zinc-700">{accountSummary.avgPayoutPct.toFixed(1)}% del lordo</div>
                </div>
              </div>
            </div>

            {/* Per-marketplace breakdown */}
            <div className="space-y-3">
              {lastSettlements.map((s: AmazonDashboardLastSettlement) => {
                const hf = s.historicalFees;
                const totalFeesPct = (100 - s.payoutRatioPct).toFixed(1);
                return (
                  <div key={s.marketplace} className="bg-bg-base/40 border border-bg-border/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MpFlag mp={s.marketplace} />
                        <span className="text-xs font-bold text-zinc-100">{s.marketplace}</span>
                      </div>
                      <div className="text-right text-[10px]">
                        <span className="text-white tabular-nums">{fmtEur(hf.grossSales)}</span>
                        <span className="text-zinc-600 mx-1">→</span>
                        <span className="text-emerald-400 font-semibold tabular-nums">{fmtEur(hf.realPayout)}</span>
                      </div>
                    </div>
                    {/* Fee bars */}
                    <div className="space-y-1">
                      {[
                        { label: `Commissione referral`, pct: hf.commissionPct, color: "bg-blue-500/60" },
                        { label: `FBA fee`, pct: hf.fbaPct, color: "bg-orange-500/60" },
                        { label: `PPC / Ads`, pct: hf.adsPct, color: "bg-purple-500/60" },
                        { label: `Storage / Logistica`, pct: hf.storagePct, color: "bg-zinc-500/50" },
                      ].filter(r => r.pct > 0).map(r => (
                        <div key={r.label} className="flex items-center gap-2 text-[10px]">
                          <div className="w-32 text-zinc-600 shrink-0">{r.label}</div>
                          <div className="flex-1 bg-bg-border/30 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(100, r.pct * 2)}%` }} />
                          </div>
                          <div className="w-12 text-right text-red-400/70 tabular-nums font-medium">{r.pct.toFixed(1)}%</div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 text-[10px] pt-0.5 border-t border-bg-border/30">
                        <div className="w-32 text-zinc-500 shrink-0 font-semibold">Totale fee Amazon</div>
                        <div className="flex-1" />
                        <div className="w-12 text-right text-red-400/80 font-bold">{totalFeesPct}%</div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <div className="w-32 text-emerald-400 shrink-0 font-bold">Payout netto</div>
                        <div className="flex-1" />
                        <div className="w-12 text-right text-emerald-400 font-bold">{s.payoutRatioPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ TAB: OVERDUE ══ */}
        {tab === "overdue" && hasOverdue && (
          <div>
            <p className="text-[11px] text-zinc-600 mb-3">
              Ordini <strong className="text-zinc-400">più vecchi di 45 giorni</strong> nel periodo coperto dai settlement,
              mai apparsi in nessun report. Sono potenziali anomalie da verificare con Amazon Seller Central.
            </p>
            <div className="space-y-2">
              {overdue.byMarketplace.map(mp => (
                <div key={mp.marketplace} className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/10 rounded-lg px-3 py-2">
                  <MpFlag mp={mp.marketplace} />
                  <span className="text-xs font-semibold text-zinc-200 w-8">{mp.marketplace}</span>
                  <span className="text-[10px] text-zinc-600">{fmtNum(mp.count)} ordini</span>
                  <div className="flex-1" />
                  <span className="text-xs font-bold text-orange-400 tabular-nums">{fmtEur(mp.grossAmount)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-zinc-600 border-t border-bg-border/40 pt-2">
              Vai in{" "}
              <a href="/amazon/payments" className="text-accent-primary/70 hover:text-accent-primary underline">
                Pagamenti → Non Riconciliati
              </a>{" "}per il dettaglio completo e l&apos;export CSV.
            </div>
          </div>
        )}

        {/* ══ TAB: NEXT PAYMENTS ══ */}
        {tab === "next" && (
          <div>
            <p className="text-[11px] text-zinc-600 mb-3">
              Prossimo bonifico atteso per marketplace (ciclo 14 giorni dalla fine settlement).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lastSettlements.map((s: AmazonDashboardLastSettlement) => {
                const nextDate = s.nextExpected ? new Date(s.nextExpected + "T12:00:00") : null;
                const today = new Date();
                const daysUntil = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null;
                const isPast = daysUntil !== null && daysUntil < 0;
                // Estimate next payout from in-flight for this marketplace
                const mpInFlight = inFlight.byMarketplace.find(r => r.marketplace === s.marketplace);
                return (
                  <div key={s.marketplace} className="bg-bg-base/40 rounded-xl border border-bg-border/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <MpFlag mp={s.marketplace} />
                        <span className="text-xs font-bold text-zinc-100">{s.marketplace}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 tabular-nums">{fmtEur(s.totalAmount)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 space-y-0.5">
                      <div>Ultimo pagamento: <span className="text-zinc-400">{fmtDate(s.depositDate)}</span></div>
                      <div>Settlement fino al: <span className="text-zinc-400">{fmtDate(s.endDate)}</span></div>
                      <div className={`font-semibold mt-1.5 ${isPast ? "text-orange-400" : "text-blue-400"}`}>
                        Prossimo previsto: {fmtDate(s.nextExpected)}
                        {daysUntil !== null && (
                          <span className="text-zinc-600 font-normal ml-1">
                            ({isPast ? `${Math.abs(daysUntil)}gg fa` : `tra ${daysUntil}gg`})
                          </span>
                        )}
                      </div>
                      {mpInFlight && (
                        <div className="mt-1 pt-1 border-t border-bg-border/30">
                          <span className="text-zinc-600">Riserva in transito: </span>
                          <span className="text-white">{fmtEur(mpInFlight.grossAmount)} lordo</span>
                          <span className="text-zinc-600"> → </span>
                          <span className="text-emerald-400 font-medium">{fmtEur(mpInFlight.estNetAmount)} netto est.</span>
                        </div>
                      )}
                      <div className="text-zinc-700 mt-0.5">Payout ratio storico: {s.payoutRatioPct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function AmazonOverviewPage() {
  const { marketplace: globalMarketplace, setMarketplace: setGlobalMarketplace } = useMarketplaceFilter();
  // This page speaks the backend's raw Amazon marketplace codes ("IT", "DE", ...),
  // but the global filter speaks "AMAZON_IT" etc. — translate at this page's boundary
  // so the ~40 existing internal uses of `marketplace`/`setMarketplace` below need no
  // changes, and so this page's own pill row doesn't write an incompatible raw code
  // into shared global state that every other page/component would misinterpret.
  const marketplace = isAmazonChannel(globalMarketplace) ? amazonChannelCode(globalMarketplace)! : "all";
  const setMarketplace = (code: string) =>
    setGlobalMarketplace(code === "all" ? "all" : `AMAZON_${code}`);
  const [activeView, setActiveView] = useState<DashboardView>("tiles");
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [overview, setOverview] = useState<AmazonOverview | null>(null);
  const [summary, setSummary] = useState<AmazonSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimePoint[]>([]);
  const [hourlyTimeseries, setHourlyTimeseries] = useState<TimePoint[]>([]);
  const [selectedHourlyDate, setSelectedHourlyDate] = useState<string>("");
  const [products, setProducts] = useState<AmazonProduct[]>([]);
  const [productKpis, setProductKpis] = useState<any>(null);
  const [dashData, setDashData] = useState<AmazonDashboardResponse | null>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [loadingHourly, setLoadingHourly] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  // null until mount — see src/app/page.tsx's clockTime for why.
  const [clockTime, setClockTime] = useState<Date | null>(null);

  const handlePeriodSelect = useCallback((p: Period) => {
    setPeriod(p);
  }, []);

  // ── Period params ──────────────────────────────────────────────────────────
  const periodParams = useMemo((): Record<string, string> => {
    const p: Record<string, string> = {};
    if (marketplace !== "all") p.marketplace = marketplace;
    if (period === "custom") {
      p.filter = "custom"; p.from = customFrom; p.to = customTo;
    } else if (period === "last7" || period === "last30") {
      // Use the same Italy-calendar day boundaries as the Dashboard period
      // tiles. The backend's rolling `last7/last30` windows can include a
      // different partial day, making Amazon totals disagree with Dashboard.
      const range = getDateRangeForPreset(period);
      p.filter = "custom";
      if (range) { p.from = range.from; p.to = range.to; }
    } else {
      p.filter = period;
    }
    return p;
  }, [marketplace, period, customFrom, customTo]);

  // ── Load overview (5-period summary cards) ─────────────────────────────────
  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const params: Record<string, string> = {};
      if (marketplace !== "all") params.marketplace = marketplace;
      setOverview(await api.amazon.overview(params));
    } catch (e) {
      console.error("[AmazonPage] overview error:", e);
      setOverviewError(e instanceof Error ? e.message : String(e));
    }
    finally { setLoadingOverview(false); }
  }, [marketplace]);

  // ── Load period data ───────────────────────────────────────────────────────
  const loadPeriod = useCallback(async () => {
    setLoadingPeriod(true);
    setLoadingProducts(true);
    try {
      const [s, ts] = await Promise.all([
        api.amazon.summary(periodParams),
        api.amazon.timeseries({ ...periodParams, granularity: "hour" }),
      ]);
      setSummary(s);
      setTimeseries(ts);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoadingPeriod(false); }

    try {
      const res = await api.amazon.products(periodParams);
      setProducts(res.products ?? []);
      setProductKpis(res.kpis ?? null);
    } catch (e) { console.error(e); }
    finally { setLoadingProducts(false); }
  }, [periodParams]);

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try { setDashData(await api.amazon.dashboard()); }
    catch (e) { console.error(e); }
    finally { setLoadingDash(false); }
  }, []);

  const loadHourlyData = useCallback(async (selectedDate: string) => {
    if (!selectedDate) {
      setHourlyTimeseries([]);
      setSelectedHourlyDate("");
      return;
    }

    setLoadingHourly(true);
    try {
      // Load hourly data for the selected date + 3 previous days for comparison
      const dateObj = new Date(selectedDate + "T12:00:00");
      const from = new Date(dateObj);
      from.setDate(from.getDate() - 3);
      const fromStr = from.toISOString().split("T")[0];
      const toStr = selectedDate;

      const params: Record<string, string> = {
        filter: "custom",
        from: fromStr,
        to: toStr,
        granularity: "hour",
      };
      if (marketplace !== "all") params.marketplace = marketplace;

      const data = await api.amazon.timeseries(params);
      setHourlyTimeseries(data);
      setSelectedHourlyDate(selectedDate);
    } catch (e) { console.error(e); }
    finally { setLoadingHourly(false); }
  }, [marketplace]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadPeriod(); }, [loadPeriod]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const t = setInterval(() => { loadOverview(); loadPeriod(); loadDashboard(); }, 5 * 60_000);
    return () => clearInterval(t);
  }, [loadOverview, loadPeriod, loadDashboard]);

  // Live clock — ticks every second
  useEffect(() => {
    setClockTime(new Date());
    const t = setInterval(() => setClockTime(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? period;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── View tabs: Tiles / Chart / P&L / Trends ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <OverviewViewTabs activeView={activeView} onChange={setActiveView} />
      </div>

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Amazon Dashboards</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">Aggiornato {clockTime ? clockTime.toLocaleTimeString("it-IT") : "--:--:--"}</p>
        </div>
        <button
          onClick={() => { loadOverview(); loadPeriod(); }}
          className="p-2 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={(loadingOverview || loadingPeriod || loadingProducts) ? "animate-spin" : ""} />
        </button>
      </div>

      {/* PERIOD SELECTOR */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <SlidersHorizontal size={13} className="text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Analisi per periodo</span>
          {(loadingPeriod || loadingProducts || loadingHourly) && <RefreshCw size={11} className="text-zinc-600 animate-spin ml-1" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                handlePeriodSelect(opt.value);
                if (selectedHourlyDate) setSelectedHourlyDate("");
              }}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-lg border font-medium transition-all ${period === opt.value
                ? "bg-accent-primary/15 border-accent-primary/40 text-accent-primary"
                : "bg-bg-base border-bg-border text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}
            >
              {opt.label}
            </button>
          ))}

          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2 pt-2 mt-1 border-t border-bg-border w-full">
              <Calendar size={12} className="text-zinc-500 shrink-0" />
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-bg-base border border-bg-border rounded-lg px-2 sm:px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-accent-primary/50 w-full sm:w-auto"
              />
              <span className="text-zinc-600">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-bg-base border border-bg-border rounded-lg px-2 sm:px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-accent-primary/50 w-full sm:w-auto"
              />
            </div>
          )}
        </div>

        {/* Hourly detail selector */}
        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-bg-border/50 flex flex-wrap items-center gap-2">
          <Calendar size={12} className="text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-500">Dettaglio orario:</span>
          <input
            type="date"
            value={selectedHourlyDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={e => loadHourlyData(e.target.value)}
            className="bg-bg-base border border-bg-border rounded-lg px-2 sm:px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-accent-primary/50"
          />
          {selectedHourlyDate && (
            <button
              onClick={() => setSelectedHourlyDate("")}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 5-PERIOD OVERVIEW CARDS — clickable to set period filter */}
      {overviewError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          Errore caricamento overview: {overviewError}
        </div>
      )}

      {/* In tiles view: show SellerboardKpiCards (Amazon-focused) + existing AmazonOverviewCards */}
      {activeView === "tiles" && (
        <SellerboardKpiCards
          activePeriod={period}
          onPeriodSelect={(p) => setPeriod(p as Period)}
          defaultSource="amazon"
        />
      )}

      {/* P&L view */}
      {activeView === "pl" && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="text-center">
            <p className="text-white font-semibold mb-1">Profit &amp; Loss — Amazon</p>
            <p className="text-sm text-zinc-400">Visualizza margini, costi e redditività per periodo</p>
          </div>
          <a
            href="/amazon/pl"
            className="px-6 py-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/20 text-accent-amber font-medium hover:bg-accent-amber/20 transition-colors"
          >
            Apri sezione P&amp;L →
          </a>
        </div>
      )}

      {/* Chart and Trends views: show AmazonOverviewCards + charts */}
      {(activeView === "chart" || activeView === "trends") && (
        <AmazonOverviewCards
          overview={overview}
          loading={loadingOverview}
          onPeriodSelect={p => handlePeriodSelect(p as Period)}
          activePeriod={period}
        />
      )}

      {/* PRODUCTS TABLE */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-bg-border space-y-3">
          {/* Row 1: title + kpis */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package size={14} className="text-zinc-500" />
                Prodotti venduti — {periodLabel}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {loadingProducts
                  ? "Caricamento…"
                  : `${products.length} prodotti · ${fmtNum(productKpis?.totalUnits ?? 0)} unità totali`}
              </p>
            </div>

            {productKpis && !loadingProducts && (
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span>Lordo: <span className="text-white font-medium">{fmtEur(productKpis.totalGross ?? 0)}</span></span>
                <span>Netto: <span className="text-emerald-400 font-medium">{fmtEur(productKpis.totalNet ?? 0)}</span></span>
                <span>Resi: <span className="text-amber-400 font-medium">{fmtEur(Math.abs(productKpis.totalRefunds ?? 0))}</span></span>
              </div>
            )}
          </div>

          {/* Row 2: marketplace selector — horizontal scroll on mobile */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 pb-0.5 w-max sm:w-auto sm:flex-wrap">
              {MARKETPLACES.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMarketplace(m.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-all shrink-0 ${marketplace === m.value
                    ? "bg-accent-primary/15 border-accent-primary/40 text-accent-primary"
                    : "bg-bg-base border-bg-border text-zinc-500 hover:text-white hover:border-zinc-600"
                    }`}
                >
                  {m.flag && (
                    <img
                      src={`/images/flags/${m.flag}.png`}
                      alt={m.value}
                      style={{ width: 16, height: 11, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
                    />
                  )}
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ProductsTable products={products} loading={loadingProducts} />
      </div>

      {/* REVENUE CHART + MARKETPLACE TABLE */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <AmazonRevenueChart
            data={selectedHourlyDate ? hourlyTimeseries : timeseries}
            loading={selectedHourlyDate ? loadingHourly : loadingPeriod}
            hourlyMode={selectedHourlyDate !== ""}
            selectedDate={selectedHourlyDate}
            onDateSelect={loadHourlyData}
          />
        </div>
        <div>
          <AmazonMarketplaceTable summary={summary} loading={loadingPeriod} />
        </div>
      </div>

      {/* SETTLEMENT / RISERVA WIDGET */}
      <SettlementWidget dashData={dashData} loading={loadingDash} />
    </div>
  );
}
