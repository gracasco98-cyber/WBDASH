"use client";
import { useState, useEffect, useMemo } from "react";
import { AmazonProduct, api } from "@/lib/api";
import { TrendingUp, TrendingDown, CheckCircle, AlertCircle } from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";

interface Props {
  products: AmazonProduct[];
  loading: boolean;
}

const MP_FLAGS: Record<string, string> = { IT:"🇮🇹", DE:"🇩🇪", FR:"🇫🇷", ES:"🇪🇸", UK:"🇬🇧", NL:"🇳🇱", PL:"🇵🇱", SE:"🇸🇪", EU:"🇪🇺" };

function MarginBadge({ pct }: { pct: number }) {
  const cls = pct >= 30 ? "text-emerald-400 bg-emerald-400/10"
            : pct >= 15 ? "text-blue-400 bg-blue-400/10"
            : pct >= 0  ? "text-amber-400 bg-amber-400/10"
            : "text-red-400 bg-red-400/10";
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${cls}`}>
      <Icon size={10} />
      {pct.toFixed(1)}%
    </span>
  );
}

type SortKey = "grossRevenue" | "unitsSold" | "grossProfit" | "marginPct" | "estPayout" | "orderCount";

const PRODUCTS_PAGE = 20;

export default function AmazonProductsTable({ products, loading }: Props) {
  const [sortBy,  setSortBy]  = useState<SortKey>("grossRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [prodPage, setProdPage] = useState(0);
  const [realImages, setRealImages] = useState<Record<string, string>>({});

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
    setProdPage(0);
  }

  const sorted = useMemo(() => [...products].sort((a, b) =>
    sortDir === "asc" ? (a as any)[sortBy] - (b as any)[sortBy] : (b as any)[sortBy] - (a as any)[sortBy]
  ), [products, sortBy, sortDir]);

  const totalPages = Math.ceil(sorted.length / PRODUCTS_PAGE);
  const paginated  = sorted.slice(prodPage * PRODUCTS_PAGE, (prodPage + 1) * PRODUCTS_PAGE);

  // Fetch images only for the current page's ASINs (backend caches 24h)
  useEffect(() => {
    if (!paginated.length) return;
    const asins = [...new Set(paginated.map(p => p.asin))];
    const missing = asins.filter(a => !(a in realImages));
    if (!missing.length) return;
    api.amazon.catalogImages(missing).then(map => {
      setRealImages(prev => {
        const next = { ...prev };
        for (const [asin, url] of Object.entries(map)) {
          next[asin] = url ?? "";
        }
        return next;
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodPage, products]);

  function SortTh({ k, label }: { k: SortKey; label: string }) {
    const active = sortBy === k;
    return (
      <th onClick={() => toggleSort(k)}
        className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-zinc-300 select-none">
        <span className={`flex items-center gap-1 ${active ? "text-zinc-200" : ""}`}>
          {label}
          {active && <span className="text-[10px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
        </span>
      </th>
    );
  }

  const cogsCount = products.filter((p) => p.hasCogs).length;

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      {/* COGS coverage banner */}
      {products.length > 0 && cogsCount < products.length && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/15 text-xs">
          <AlertCircle size={13} className="text-amber-400 shrink-0" />
          <span className="text-amber-400 font-medium">{products.length - cogsCount} prodotti</span>
          <span className="text-zinc-500">senza COGS configurato — l'utile netto potrebbe essere impreciso.
            <a href="/amazon/cogs" className="text-blue-400 ml-1 hover:underline">Configura COGS →</a>
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide w-[240px]">Prodotto / ASIN</th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide hidden sm:table-cell">MP</th>
              <SortTh k="unitsSold"    label="Unità" />
              <SortTh k="grossRevenue" label="Fatturato" />
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Promo/Sconto</th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">COGS/unità</th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap hidden md:table-cell">Comm. est.</th>
              <SortTh k="estPayout"    label="Payout est." />
              <SortTh k="grossProfit"  label="Utile lordo" />
              <SortTh k="marginPct"    label="Margine" />
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap hidden md:table-cell">Ordini</th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Prezzo medio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border/50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 12 }).map((_, j) => (
                  <td key={j} className={`px-4 py-3 ${j === 1 ? "hidden sm:table-cell" : [4,5,8].includes(j) ? "hidden lg:table-cell" : [6,10].includes(j) ? "hidden md:table-cell" : ""}`}>
                    <div className="h-3 bg-bg-border rounded animate-pulse w-16" />
                  </td>
                ))}</tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-zinc-600">
                  Nessun prodotto trovato — esegui un backfill dal Sync Center
                </td>
              </tr>
            ) : (
              paginated.map((p, i) => {
                // Use DB imageUrl as primary, catalog API as fallback
                const imgSrc = (p as any).imageUrl || realImages[p.asin] || null;
                return (
                  <tr key={`${p.asin}-${p.marketplace}-${i}`} className="hover:bg-zinc-800/20 transition-colors group">
                    {/* Product + image */}
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center gap-2.5">
                        {/* Image — larger and always visible */}
                        <div className="w-12 h-12 sm:w-11 sm:h-11 shrink-0 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center border border-zinc-700/50">
                          {imgSrc ? (
                            <img
                              src={imgSrc} alt={p.productTitle}
                              className="w-full h-full object-contain"
                              onError={e => {
                                const el = e.currentTarget as HTMLImageElement;
                                el.style.display = "none";
                                // Show fallback text
                                el.parentElement!.innerHTML = `<span style="color:#52525b;font-size:10px;font-family:monospace;padding:2px">${p.asin.slice(0,4)}</span>`;
                              }}
                            />
                          ) : (
                            <span className="text-zinc-600 text-[10px] font-mono leading-tight text-center px-1">{p.asin.slice(0, 6)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-zinc-200 font-medium truncate max-w-[140px] sm:max-w-[160px] text-xs sm:text-sm" title={p.productTitle}>
                            {p.productTitle}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-zinc-600 font-mono text-[10px]">{p.asin}</span>
                            {p.sku && <span className="text-zinc-700 font-mono text-[10px]">· {p.sku}</span>}
                          </div>
                          {/* Units sold — prominently shown under title on mobile */}
                          <div className="flex items-center gap-1 mt-1 sm:hidden">
                            <span className="text-[10px] text-zinc-600">unità:</span>
                            <span className="text-white font-bold text-xs tabular-nums">{fmtNum(p.unitsSold)}</span>
                          </div>
                          {p.hasCogs ? (
                            <CheckCircle size={9} className="text-emerald-500/60 mt-0.5" />
                          ) : (
                            <span title="COGS non configurato"><AlertCircle size={9} className="text-amber-500/60 mt-0.5" /></span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Marketplace */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="flex items-center gap-1">
                        <span>{MP_FLAGS[p.marketplace] ?? "🌐"}</span>
                        <span className="text-zinc-500">{p.marketplace}</span>
                      </span>
                    </td>
                    {/* Units — hidden on mobile (shown inline above) */}
                    <td className="px-4 py-3 text-white font-bold tabular-nums hidden sm:table-cell">{fmtNum(p.unitsSold)}</td>
                    {/* Revenue */}
                    <td className="px-4 py-3 text-emerald-400 font-semibold tabular-nums">{fmtEur(p.grossRevenue)}</td>
                    {/* Promo */}
                    <td className="px-4 py-3 tabular-nums hidden lg:table-cell">
                      {p.totalDiscount > 0
                        ? <span className="text-orange-400">−{fmtEur(p.totalDiscount)}</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    {/* COGS per unit */}
                    <td className="px-4 py-3 tabular-nums hidden lg:table-cell">
                      {p.hasCogs
                        ? <span className="text-zinc-300">{fmtEur(p.cogsPerUnit + p.shippingCost)}</span>
                        : <span className="text-amber-500/60 italic">—</span>}
                    </td>
                    {/* Est. fees */}
                    <td className="px-4 py-3 text-red-400 tabular-nums hidden md:table-cell">−{fmtEur(p.estFees)}</td>
                    {/* Est. payout */}
                    <td className="px-4 py-3 text-blue-400 font-semibold tabular-nums">{fmtEur(p.estPayout)}</td>
                    {/* Gross profit */}
                    <td className={`px-4 py-3 font-semibold tabular-nums ${p.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtEur(p.grossProfit)}
                    </td>
                    {/* Margin */}
                    <td className="px-4 py-3"><MarginBadge pct={p.marginPct} /></td>
                    {/* Orders */}
                    <td className="px-4 py-3 text-zinc-400 tabular-nums hidden md:table-cell">{fmtNum(p.orderCount)}</td>
                    {/* Avg price */}
                    <td className="px-4 py-3 text-zinc-400 tabular-nums hidden lg:table-cell">{fmtEur(p.avgUnitPrice)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-bg-border">
          <button onClick={() => setProdPage(p => Math.max(0, p - 1))} disabled={prodPage === 0}
            className="px-3 py-1 text-xs rounded-lg border border-bg-border text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">←</button>
          <span className="text-xs text-zinc-500">Pag. {prodPage + 1} / {totalPages} ({sorted.length} prodotti)</span>
          <button onClick={() => setProdPage(p => Math.min(totalPages - 1, p + 1))} disabled={prodPage === totalPages - 1}
            className="px-3 py-1 text-xs rounded-lg border border-bg-border text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">→</button>
        </div>
      )}
      {/* Footer */}
      {products.length > 0 && (
        <div className="px-4 py-2.5 border-t border-bg-border flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
          <span>* Commissioni stimate: 15% referral + €3,80/unità FBA. Utile lordo = Payout − COGS.</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-emerald-500/60" /> Con COGS</span>
            <span className="flex items-center gap-1"><AlertCircle size={10} className="text-amber-500/60" /> Senza COGS</span>
          </div>
        </div>
      )}
    </div>
  );
}
