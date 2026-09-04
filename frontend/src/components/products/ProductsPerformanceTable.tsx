"use client";
import { useState, useEffect, Fragment } from "react";
import type { ProductPerformanceGroup, ProductPerformanceRow, ProductPerformance } from "@/lib/api";
import { api } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import MetricRow, { fmtEur } from "./MetricRow";
import { ChevronDown, ChevronRight, CornerDownRight, Pencil, SlidersHorizontal, Table2, PackageSearch } from "lucide-react";

export type GroupBy = "marketplace" | "product";

interface Props {
  groups: ProductPerformanceGroup[];
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  onRenamed: () => void;
  onMoved: () => void;
  onVatRateChanged?: () => void;
  /** Non-Amazon channels (Shopify: Redcare, Temu, eBay, ...), pre-built via
   *  buildShopifyMarketplaceRows. Only shown in the "marketplace" grouping —
   *  Shopify products have no unified identity with Amazon ASINs to group by
   *  in "product" mode, so that mode stays Amazon-only. */
  shopifyMarketplaceRows?: RowEntry[];
}

const MARKETPLACE_LABEL: Record<string, string> = {
  IT: "Amazon.it", DE: "Amazon.de", FR: "Amazon.fr", ES: "Amazon.es",
  UK: "Amazon.co.uk", PL: "Amazon.pl", NL: "Amazon.nl", SE: "Amazon.se", BE: "Amazon.com.be",
};

const COLUMNS = [
  "Marketplace / Prodotto", "Unità", "Resi", "Ricavi", "Promo", "Ads", "% Resi",
  "Fee Amazon", "COGS", "Profitto lordo", "Profitto netto", "Payout stimato",
  "Margine", "ROI", "ACOS reale", "Prezzo medio", "BSR", "Stock",
];

export interface RowEntry {
  key: string;
  label: string;
  metrics: ProductPerformanceRow;
  children?: { key: string; label: string; metrics: ProductPerformanceRow }[];
}

const EMPTY_COST_ROW: Omit<ProductPerformanceRow, "marketplace" | "sku" | "units" | "sales" | "refundsAmount" | "avgSellingPrice" | "refundPct"> = {
  identifierId: "", asin: "", bsr: null,
  hasRealFees: false, hasRealCogs: false, hasStockData: false,
  costDataAvailable: false,
  promo: 0, refundsCount: 0, adsSpend: null, realAcos: null,
  amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0,
  margin: 0, roi: 0,
};

/**
 * Builds marketplace-grouped rows for non-Amazon channels from the plain
 * per-product Shopify performance list (/api/products), in the same RowEntry
 * shape ProductsPerformanceTable already renders — so Redcare/Temu/eBay/...
 * show up alongside Amazon.xx in the "marketplace" grouping. Cost/profit
 * columns are intentionally blank (costDataAvailable: false): fees and COGS
 * are not tracked for these channels yet, unlike Amazon's estimated-vs-real
 * distinction (hasRealFees/hasRealCogs), which assumes SOME cost figure exists.
 */
export function buildShopifyMarketplaceRows(products: ProductPerformance[]): RowEntry[] {
  const byMarketplace = new Map<string, ProductPerformance[]>();
  for (const p of products) {
    const list = byMarketplace.get(p.marketplace) ?? [];
    list.push(p);
    byMarketplace.set(p.marketplace, list);
  }
  return [...byMarketplace.entries()].map(([mp, items]) => {
    const units = items.reduce((s, p) => s + p.unitsSold, 0);
    const sales = items.reduce((s, p) => s + p.grossRevenue, 0);
    const refundsAmount = items.reduce((s, p) => s + p.refundedAmount, 0);
    return {
      key: `shopify-${mp}`,
      label: getMeta(mp).label,
      metrics: {
        ...EMPTY_COST_ROW,
        marketplace: mp, sku: null, units, sales, refundsAmount,
        refundPct: sales > 0 ? refundsAmount / sales : 0,
        avgSellingPrice: units > 0 ? sales / units : 0,
      },
      children: items.map((p) => ({
        key: `shopify-${mp}-${p.shopifyProductId}`,
        label: p.productTitle,
        metrics: {
          ...EMPTY_COST_ROW,
          marketplace: mp, sku: p.sku, units: p.unitsSold, sales: p.grossRevenue,
          refundsAmount: p.refundedAmount,
          refundPct: p.grossRevenue > 0 ? p.refundedAmount / p.grossRevenue : 0,
          avgSellingPrice: p.avgUnitPrice,
          imageUrl: p.imageUrl,
        },
      })),
    };
  });
}

function buildRowsByProduct(groups: ProductPerformanceGroup[]): RowEntry[] {
  return groups.map((g) => ({
    key: g.product.id,
    label: g.product.name,
    metrics: g.aggregate,
    children: g.rows.map((r) => ({
      key: `${g.product.id}-${r.marketplace}-${r.asin}`,
      label: MARKETPLACE_LABEL[r.marketplace] ?? r.marketplace,
      metrics: r,
    })),
  }));
}

function buildRowsByMarketplace(groups: ProductPerformanceGroup[]): RowEntry[] {
  const byMarketplace = new Map<string, { rows: ProductPerformanceRow[]; labels: Map<string, string> }>();
  for (const g of groups) {
    for (const r of g.rows) {
      const entry = byMarketplace.get(r.marketplace) ?? { rows: [] as ProductPerformanceRow[], labels: new Map<string, string>() };
      entry.rows.push(r);
      entry.labels.set(`${g.product.id}::${r.asin}`, g.product.name);
      byMarketplace.set(r.marketplace, entry);
    }
  }
  return [...byMarketplace.entries()].map(([mp, { rows, labels }]) => {
    const sum = rows.reduce(
      (acc, r) => ({
        units: acc.units + r.units, sales: acc.sales + r.sales, promo: acc.promo + r.promo,
        refundsAmount: acc.refundsAmount + r.refundsAmount, refundsCount: acc.refundsCount + r.refundsCount,
        amazonFees: acc.amazonFees + r.amazonFees, cogs: acc.cogs + r.cogs, stock: acc.stock + r.stock,
        grossProfit: acc.grossProfit + r.grossProfit, netProfit: acc.netProfit + r.netProfit,
        estimatedPayout: acc.estimatedPayout + r.estimatedPayout,
        adsSpend: r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      }),
      { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, adsSpend: null as number | null }
    );
    const aggregate: ProductPerformanceRow = {
      identifierId: "", asin: "", marketplace: mp, sku: null, bsr: null,
      hasRealFees: rows.every((r) => r.hasRealFees),
      hasRealCogs: rows.every((r) => r.hasRealCogs),
      hasStockData: rows.every((r) => r.hasStockData),
      refundPct: sum.sales > 0 ? sum.refundsAmount / sum.sales : 0,
      realAcos: sum.adsSpend !== null && sum.sales > 0 ? sum.adsSpend / sum.sales : null,
      margin: sum.sales > 0 ? sum.netProfit / sum.sales : 0,
      roi: sum.cogs > 0 ? sum.netProfit / sum.cogs : 0,
      avgSellingPrice: sum.units > 0 ? sum.sales / sum.units : 0,
      ...sum,
    };
    return {
      key: mp,
      label: MARKETPLACE_LABEL[mp] ?? mp,
      metrics: aggregate,
      children: rows.map((r) => {
        const productName = [...labels.entries()].find(([k]) => k.endsWith(`::${r.asin}`))?.[1] ?? r.asin;
        return { key: `${mp}-${r.asin}`, label: productName, metrics: r };
      }),
    };
  });
}

/** Inline-editable "IVA %" field for one identifier row — same crude-but-
 *  functional pattern as the existing "Sposta prodotto" affordance (no
 *  dedicated edit modal exists in this table yet). Commits on blur or Enter;
 *  an empty value clears the rate (sends null). */
function VatRateEditor({
  identifierId, initialRate, onSave,
}: {
  identifierId: string;
  initialRate: number | null | undefined;
  onSave: (identifierId: string, vatRate: number | null) => void;
}) {
  const [value, setValue] = useState(initialRate != null ? String(initialRate) : "");

  const commit = () => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) return;
    onSave(identifierId, parsed);
  };

  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <span className="text-[10px] text-zinc-500">IVA</span>
      <input
        aria-label="Aliquota IVA %"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={commit}
        placeholder="—"
        className="w-12 text-[10px] bg-bg-base border border-bg-border rounded px-1 py-0.5 text-zinc-300"
      />
      <span className="text-[10px] text-zinc-600">%</span>
    </span>
  );
}

export default function ProductsPerformanceTable({ groups, groupBy, onGroupByChange, onRenamed, onMoved, onVatRateChanged, shopifyMarketplaceRows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetProductId, setTargetProductId] = useState("");
  const [images, setImages] = useState<Record<string, string | null>>({});

  const rows = groupBy === "product"
    ? buildRowsByProduct(groups)
    : [...buildRowsByMarketplace(groups), ...(shopifyMarketplaceRows ?? [])];

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const asins = [...new Set(groups.flatMap((g) => g.rows.map((r) => r.asin)).filter(Boolean))];
    if (asins.length === 0) return;
    let cancelled = false;
    api.amazon.catalogImages(asins).then((map) => { if (!cancelled) setImages(map); }).catch((err) => console.error("[ProductsPerformanceTable] Failed to load thumbnails:", err));
    return () => { cancelled = true; };
  }, [groups]);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const handleRename = async (productId: string, currentName: string) => {
    const name = window.prompt("Nuovo nome prodotto:", currentName);
    if (!name || name === currentName) return;
    try {
      await api.productPerformance.rename(productId, name);
      onRenamed();
    } catch (err) {
      console.error("[ProductsPerformanceTable] Rename failed:", err);
      window.alert("Impossibile rinominare il prodotto. Riprova.");
    }
  };

  const handleVatRateSave = async (identifierId: string, vatRate: number | null) => {
    try {
      await api.productPerformance.updateVatRate(identifierId, vatRate);
      onVatRateChanged?.();
    } catch (err) {
      console.error("[ProductsPerformanceTable] VAT rate update failed:", err);
      window.alert("Impossibile aggiornare l'aliquota IVA. Riprova.");
    }
  };

  const handleMove = async (identifierId: string) => {
    if (!targetProductId) return;
    try {
      await api.productPerformance.moveIdentifier(identifierId, targetProductId);
      setMovingId(null);
      setTargetProductId("");
      onMoved();
    } catch (err) {
      console.error("[ProductsPerformanceTable] Move failed:", err);
      window.alert("Impossibile spostare il prodotto. Riprova.");
    }
  };

  const parentLabel = (entry: RowEntry, isOpen: boolean) => (
    <>
      <button
        aria-label={`Espandi ${entry.label}`}
        onClick={() => toggle(entry.key)}
        className="bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-inherit hover:text-accent-primary transition-colors"
      >
        {isOpen ? <ChevronDown size={13} className="text-accent-primary" /> : <ChevronRight size={13} className="text-zinc-400" />}
        {entry.label}
      </button>
      {groupBy === "product" && (
        <button title="Rinomina" onClick={() => handleRename(entry.key, entry.label)} className="ml-1.5 bg-transparent border-none cursor-pointer text-zinc-500 hover:text-accent-blue transition-colors">
          <Pencil size={11} />
        </button>
      )}
    </>
  );

  const childLabel = (child: { key: string; label: string; metrics: ProductPerformanceRow }) => {
    // Righe Amazon: cercate per ASIN nella mappa caricata da catalogImages().
    // Righe Shopify/Redcare (asin sempre "", niente lookup ASIN possibile):
    // il backend restituisce già l'imageUrl del prodotto su metrics.imageUrl.
    const thumb = images[child.metrics.asin] ?? child.metrics.imageUrl ?? null;
    return (
    <>
      <div className="ml-5 flex items-center gap-2">
        {thumb ? (
          <img src={thumb} alt="" className="w-[22px] h-[22px] rounded-[5px] object-cover shrink-0" />
        ) : (
          <div className="w-[22px] h-[22px] rounded-[5px] bg-bg-hover shrink-0" />
        )}
        <span className="ml-1 text-zinc-500"><CornerDownRight size={11} className="inline text-zinc-400 mr-1" />{child.label} — <span>{child.metrics.asin}</span></span>
        {child.metrics.identifierId && (
          <VatRateEditor identifierId={child.metrics.identifierId} initialRate={child.metrics.vatRate} onSave={handleVatRateSave} />
        )}
      </div>
      {groupBy === "product" && (
        <button onClick={() => setMovingId(child.key)} className="ml-2 text-[10px] text-accent-blue bg-transparent border-none cursor-pointer underline">
          Sposta in un altro prodotto…
        </button>
      )}
      {movingId === child.key && (
        <span className="ml-2">
          <input
            aria-label="ID prodotto destinazione"
            value={targetProductId}
            onChange={(e) => setTargetProductId(e.target.value)}
            placeholder="ID prodotto destinazione"
            className="text-[10px] w-40 bg-bg-base border border-bg-border rounded px-1 py-0.5 text-zinc-300"
          />
          <button onClick={() => handleMove(child.metrics.identifierId)} className="text-[10px] ml-1 text-zinc-300 hover:text-white">OK</button>
        </span>
      )}
    </>
    );
  };

  return (
    <div className="bg-bg-card rounded-xl border border-bg-border text-zinc-300 shadow-sm overflow-hidden">
      <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 border-b border-bg-border/70">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold text-zinc-600"><Table2 size={14} className="text-accent-blue" />Prodotti</span>
          <span className="hidden sm:inline text-[10px] text-zinc-500">Performance per canale e prodotto</span>
        </div>
        <label className="text-xs text-zinc-400">
          <span className="mr-1.5">Raggruppa per</span>
          <select
            aria-label="Raggruppa per"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
            className="bg-bg-card border border-bg-border rounded-lg px-2 py-1 text-zinc-700 shadow-sm focus:outline-none focus:border-accent-primary"
          >
            <option value="marketplace">Marketplace</option>
            <option value="product">Prodotto</option>
          </select>
        </label>
      </div>

      {/* A compact view keeps the most important metrics visible on phones.
       * The full financial table remains available on desktop and can still
       * be exported without losing any columns. */}
      {isMobile && <div className="divide-y divide-bg-border/70">
        {rows.length === 0 ? (
          <div className="py-12 text-center px-4">
            <PackageSearch size={26} className="mx-auto mb-2 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-600">Nessun dato nel periodo selezionato</p>
            <p className="mt-1 text-[11px] text-zinc-500">Prova a cambiare periodo o marketplace.</p>
          </div>
        ) : rows.map((entry) => {
          const isOpen = expanded.has(entry.key);
          const m = entry.metrics;
          return (
            <div key={entry.key} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 font-medium text-zinc-700">{parentLabel(entry, isOpen)}</div>
                <div className="text-right shrink-0"><div className="text-[10px] text-zinc-500">Ricavi</div><div className="text-sm font-semibold tabular-nums text-zinc-800">{fmtEur(m.sales)}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg bg-bg-hover/70 px-2 py-1.5"><div className="text-[9px] uppercase text-zinc-500">Unità</div><div className="text-xs font-semibold tabular-nums text-zinc-700">{m.units}</div></div>
                <div className="rounded-lg bg-bg-hover/70 px-2 py-1.5"><div className="text-[9px] uppercase text-zinc-500">Profitto</div><div className={`text-xs font-semibold tabular-nums ${m.netProfit < 0 ? "text-accent-red" : "text-accent-primary"}`}>{fmtEur(m.netProfit)}</div></div>
                <div className="rounded-lg bg-bg-hover/70 px-2 py-1.5"><div className="text-[9px] uppercase text-zinc-500">Margine</div><div className="text-xs font-semibold tabular-nums text-zinc-700">{(m.margin * 100).toFixed(1)}%</div></div>
              </div>
              {isOpen && entry.children && <div className="mt-2 space-y-1.5 border-t border-bg-border/60 pt-2">{entry.children.map((child) => <div key={child.key} className="flex items-center justify-between gap-2 text-[11px] text-zinc-500"><span className="min-w-0 truncate">{child.label}</span><span className="flex items-center gap-2 shrink-0"><span className="tabular-nums text-zinc-700">{fmtEur(child.metrics.sales)}</span>{child.metrics.identifierId && <VatRateEditor identifierId={child.metrics.identifierId} initialRate={child.metrics.vatRate} onSave={handleVatRateSave} />}</span></div>)}</div>}
            </div>
          );
        })}
      </div>}

      <div className="hidden md:block overflow-x-auto rounded-b-lg">
        <table className="w-full min-w-[1540px] border-collapse text-[11.5px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-500 text-left bg-bg-hover/80 border-b border-bg-border">
              <th className="sticky left-0 z-20 bg-bg-hover/95 px-2.5 py-1.5 font-semibold text-zinc-500" rowSpan={2}>Identità</th>
              <th className="px-2.5 py-1.5 text-center font-semibold" colSpan={3}>Volume</th>
              <th className="px-2.5 py-1.5 text-center font-semibold text-accent-blue/80" colSpan={3}>Vendite</th>
              <th className="px-2.5 py-1.5 text-center font-semibold text-accent-red/80" colSpan={2}>Costi</th>
              <th className="px-2.5 py-1.5 text-center font-semibold text-accent-primary/90" colSpan={4}>Risultato</th>
              <th className="px-2.5 py-1.5 text-center font-semibold text-accent-purple/80" colSpan={3}>Efficienza</th>
              <th className="px-2.5 py-1.5 text-center font-semibold text-accent-amber/90" colSpan={2}>Inventario</th>
            </tr>
            <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
              {COLUMNS.slice(1).map((c) => <th key={c} className="px-2.5 py-2.5 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-14 text-center">
                  <PackageSearch size={26} className="mx-auto mb-2 text-zinc-400" />
                  <p className="text-sm font-medium text-zinc-600">Nessun dato nel periodo selezionato</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Prova a cambiare periodo o marketplace.</p>
                </td>
              </tr>
            ) : rows.map((entry) => {
              const isOpen = expanded.has(entry.key);
              return (
                <Fragment key={entry.key}>
                  <MetricRow label={parentLabel(entry, isOpen)} metrics={entry.metrics} />
                  {isOpen && entry.children?.map((child) => (
                    <MetricRow key={child.key} label={childLabel(child)} metrics={child.metrics} isChild />
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
