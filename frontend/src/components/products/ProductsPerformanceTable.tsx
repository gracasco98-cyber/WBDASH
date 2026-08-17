"use client";
import { useState, useEffect, Fragment } from "react";
import type { ProductPerformanceGroup, ProductPerformanceRow, ProductPerformance } from "@/lib/api";
import { api } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import MetricRow from "./MetricRow";

export type GroupBy = "marketplace" | "product";

interface Props {
  groups: ProductPerformanceGroup[];
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  onRenamed: () => void;
  onMoved: () => void;
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
  "Margine", "ROI", "BSR", "Prezzo medio", "ACOS reale", "Stock",
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

export default function ProductsPerformanceTable({ groups, groupBy, onGroupByChange, onRenamed, onMoved, shopifyMarketplaceRows }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetProductId, setTargetProductId] = useState("");
  const [images, setImages] = useState<Record<string, string | null>>({});

  const rows = groupBy === "product"
    ? buildRowsByProduct(groups)
    : [...buildRowsByMarketplace(groups), ...(shopifyMarketplaceRows ?? [])];

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
        className="bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-inherit"
      >
        <span>{isOpen ? "▾" : "›"}</span> {entry.label}
      </button>
      {groupBy === "product" && (
        <button title="Rinomina" onClick={() => handleRename(entry.key, entry.label)} className="ml-1.5 bg-transparent border-none cursor-pointer text-zinc-500 hover:text-zinc-300 transition-colors">
          ✎
        </button>
      )}
    </>
  );

  const childLabel = (child: { key: string; label: string; metrics: ProductPerformanceRow }) => (
    <>
      <div className="ml-5 flex items-center gap-2">
        {images[child.metrics.asin] ? (
          <img src={images[child.metrics.asin]!} alt="" className="w-[22px] h-[22px] rounded-[5px] object-cover shrink-0" />
        ) : (
          <div className="w-[22px] h-[22px] rounded-[5px] bg-bg-hover shrink-0" />
        )}
        <span className="ml-1 text-zinc-500">↳ {child.label} — <span>{child.metrics.asin}</span></span>
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

  return (
    <div className="bg-bg-card rounded-[10px] border border-bg-border text-zinc-300">
      <div className="flex justify-between items-center px-4 py-3">
        <span className="text-xs text-zinc-500">▤ Prodotti</span>
        <label className="text-xs text-zinc-400">
          Raggruppa per{" "}
          <select
            aria-label="Raggruppa per"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
            className="bg-bg-hover border border-bg-border rounded px-1.5 py-0.5 text-zinc-300"
          >
            <option value="marketplace">Marketplace</option>
            <option value="product">Prodotto</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto border-t border-bg-border rounded-b-lg">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
              {COLUMNS.map((c) => <th key={c} className="px-2.5 py-2.5 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
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
