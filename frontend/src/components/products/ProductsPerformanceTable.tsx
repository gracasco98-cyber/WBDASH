"use client";
import { useState, useEffect, Fragment } from "react";
import type {
  ProductPerformanceGroup,
  ProductPerformanceRow,
  ProductPerformance,
  AmazonOrder,
} from "@/lib/api";
import { api } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import MetricRow, { fmtEur } from "./MetricRow";
import { renderMarkdown } from "@/components/ChatWidget";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Pencil,
  Search,
  Download,
  Table2,
  PackageSearch,
  Columns3,
  ShoppingCart,
  Package,
  Sparkles,
  Loader2,
  RotateCcw,
} from "lucide-react";

export type GroupBy = "marketplace" | "product" | "brand" | "paese";
export type ViewMode = "product" | "orders";

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
  /** Current period + marketplace filter, reused for the "Ordini" view's own
   *  Amazon orders fetch — omitted, that toggle option doesn't fetch/render
   *  (existing callers/tests are unaffected). */
  dateRange?: { from: string; to: string };
  marketplace?: string;
  amazonAccountId?: string;
}

const MARKETPLACE_LABEL: Record<string, string> = {
  IT: "Amazon.it",
  DE: "Amazon.de",
  FR: "Amazon.fr",
  ES: "Amazon.es",
  UK: "Amazon.co.uk",
  PL: "Amazon.pl",
  NL: "Amazon.nl",
  SE: "Amazon.se",
  BE: "Amazon.com.be",
};

const COLUMNS = [
  "Marketplace / Prodotto",
  "Unità",
  "Resi",
  "Ricavi",
  "Promo",
  "Ads",
  "% Resi",
  "Fee Amazon",
  "Fee Redcare (15%)",
  "COGS",
  "IVA",
  "Profitto lordo",
  "Profitto netto",
  "Payout stimato",
  "Margine",
  "ROI",
  "ACOS reale",
  "Prezzo medio",
  "BSR",
  "Stock",
];

/** Mirrors the thead's group-header colSpan grouping — used to shrink (or
 *  hide entirely) a group header when the "Colonne" picker hides one or
 *  more of its member columns. */
const COLUMN_GROUPS: { label: string; className: string; columns: string[] }[] =
  [
    { label: "Volume", className: "", columns: ["Unità", "Resi", "Ricavi"] },
    {
      label: "Vendite",
      className: "text-accent-blue/80",
      columns: ["Promo", "Ads", "% Resi"],
    },
    {
      label: "Costi",
      className: "text-accent-red/80",
      columns: ["Fee Amazon", "Fee Redcare (15%)", "COGS", "IVA"],
    },
    {
      label: "Risultato",
      className: "text-accent-primary/90",
      columns: [
        "Profitto lordo",
        "Profitto netto",
        "Payout stimato",
        "Margine",
      ],
    },
    {
      label: "Efficienza",
      className: "text-accent-purple/80",
      columns: ["ROI", "ACOS reale", "Prezzo medio"],
    },
    {
      label: "Inventario",
      className: "text-accent-amber/90",
      columns: ["BSR", "Stock"],
    },
  ];

const INSIGHT_QUESTION =
  "Analizza le performance dei prodotti in questo periodo: quali sono i migliori e i peggiori per fatturato e margine, ci sono resi anomali o prodotti senza dati di costo/margine? Dammi 2-3 suggerimenti concreti e azionabili.";

const HIDDEN_COLUMNS_STORAGE_KEY = "products_table_hidden_columns_v1";

function loadHiddenColumns(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export interface RowEntry {
  key: string;
  label: string;
  metrics: ProductPerformanceRow;
  children?: { key: string; label: string; metrics: ProductPerformanceRow }[];
}

const EMPTY_COST_ROW: Omit<
  ProductPerformanceRow,
  | "marketplace"
  | "sku"
  | "units"
  | "sales"
  | "refundsAmount"
  | "avgSellingPrice"
  | "refundPct"
> = {
  identifierId: "",
  asin: "",
  bsr: null,
  hasRealFees: false,
  hasRealCogs: false,
  hasStockData: false,
  costDataAvailable: false,
  promo: 0,
  refundsCount: 0,
  adsSpend: null,
  realAcos: null,
  amazonFees: 0,
  cogs: 0,
  stock: 0,
  grossProfit: 0,
  netProfit: 0,
  estimatedPayout: 0,
  margin: 0,
  roi: 0,
};

/** Known 2-letter Amazon marketplace/country codes — used to recognize a
 *  country suffix on non-Amazon channel codes (e.g. "REDCARE_IT" -> "IT")
 *  when grouping by Paese. A channel with no recognizable country (EBAY,
 *  TIKTOK, SHOPIFY_DIRECT, ...) keeps its own bucket rather than being
 *  fabricated into a guessed country. */
const KNOWN_COUNTRY_CODES = new Set([
  "IT",
  "DE",
  "FR",
  "ES",
  "UK",
  "PL",
  "US",
  "CA",
  "NL",
  "SE",
  "BE",
]);

function countryOf(marketplaceCode: string): string {
  if (KNOWN_COUNTRY_CODES.has(marketplaceCode)) return marketplaceCode;
  const suffix = marketplaceCode.slice(marketplaceCode.lastIndexOf("_") + 1);
  return KNOWN_COUNTRY_CODES.has(suffix) ? suffix : marketplaceCode;
}

const COUNTRY_LABEL: Record<string, string> = {
  IT: "IT",
  DE: "DE",
  FR: "FR",
  ES: "ES",
  UK: "UK",
  PL: "PL",
  US: "US",
  CA: "CA",
  NL: "NL",
  SE: "SE",
  BE: "BE",
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
export function buildShopifyMarketplaceRows(
  products: ProductPerformance[],
  adSpendByMarketplace: Record<string, number> = {},
): RowEntry[] {
  const redcareMetrics = (base: { sales: number; refundsAmount: number; adsSpend: number | null; vatAmount?: number }) => {
    const vatAmount = base.vatAmount ?? 0;
    const fees = base.sales * 0.15;
    const ads = base.adsSpend ?? 0;
    const grossProfit = base.sales - base.refundsAmount - vatAmount - fees;
    const netProfit = grossProfit - ads;
    return {
      vatAmount,
      amazonFees: fees,
      cogs: 0,
      grossProfit,
      netProfit,
      estimatedPayout: base.sales - base.refundsAmount - vatAmount - fees - ads,
      margin: base.sales > 0 ? netProfit / base.sales : 0,
      roi: fees > 0 ? netProfit / fees : 0,
      realAcos: base.sales > 0 ? ads / base.sales : null,
      costDataAvailable: true,
      hasRealFees: false,
      hasRealCogs: false,
    };
  };
  const byMarketplace = new Map<string, ProductPerformance[]>();
  for (const p of products) {
    const list = byMarketplace.get(p.marketplace) ?? [];
    list.push(p);
    byMarketplace.set(p.marketplace, list);
  }
  // Keep advertising-only channels visible even when there are no orders in
  // the selected period (a common case for a newly started Redcare campaign).
  for (const [mp, spend] of Object.entries(adSpendByMarketplace)) {
    if (spend > 0 && !byMarketplace.has(mp)) {
      byMarketplace.set(mp, [{
        shopifyProductId: `ads-${mp}`,
        productTitle: `Ads ${getMeta(mp).label}`,
        sku: null,
        imageUrl: null,
        marketplace: mp,
        unitsSold: 0,
        grossRevenue: 0,
        refundedAmount: 0,
        netRevenue: -spend,
        orderCount: 0,
        avgUnitPrice: 0,
        totalDiscount: 0,
        adSpend: spend,
      }]);
    }
  }
  return [...byMarketplace.entries()].map(([mp, items]) => {
    const units = items.reduce((s, p) => s + p.unitsSold, 0);
    const sales = items.reduce((s, p) => s + p.grossRevenue, 0);
    const refundsAmount = items.reduce((s, p) => s + p.refundedAmount, 0);
    const isRedcare = mp === "REDCARE_IT";
    return {
      key: `shopify-${mp}`,
      label: getMeta(mp).label,
      metrics: {
        ...EMPTY_COST_ROW,
        marketplace: mp,
        sku: null,
        units,
        sales,
        refundsAmount,
        refundPct: sales > 0 ? refundsAmount / sales : 0,
        avgSellingPrice: units > 0 ? sales / units : 0,
        adsSpend: Object.prototype.hasOwnProperty.call(adSpendByMarketplace, mp)
          ? adSpendByMarketplace[mp]
          : null,
        ...(isRedcare ? redcareMetrics({ sales, refundsAmount, adsSpend: adSpendByMarketplace[mp] ?? null, vatAmount: items.reduce((sum, item) => sum + (item.vatAmount ?? 0), 0) }) : {}),
      },
      children: items.map((p) => {
        const productAds = sales > 0
          ? (adSpendByMarketplace[mp] ?? 0) * p.grossRevenue / sales
          : (p.adSpend ?? 0);
        return {
        key: `shopify-${mp}-${p.shopifyProductId}`,
        label: p.productTitle,
        metrics: {
          ...EMPTY_COST_ROW,
          marketplace: mp,
          sku: p.sku,
          units: p.unitsSold,
          sales: p.grossRevenue,
          refundsAmount: p.refundedAmount,
          refundPct: p.grossRevenue > 0 ? p.refundedAmount / p.grossRevenue : 0,
          avgSellingPrice: p.avgUnitPrice,
          adsSpend: isRedcare ? productAds : (p.adSpend ?? null),
          ...(isRedcare ? redcareMetrics({ sales: p.grossRevenue, refundsAmount: p.refundedAmount, adsSpend: productAds, vatAmount: p.vatAmount ?? 0 }) : {}),
          imageUrl: p.imageUrl,
        },
      }; }),
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
  const byMarketplace = new Map<
    string,
    { rows: ProductPerformanceRow[]; labels: Map<string, string> }
  >();
  for (const g of groups) {
    for (const r of g.rows) {
      const entry = byMarketplace.get(r.marketplace) ?? {
        rows: [] as ProductPerformanceRow[],
        labels: new Map<string, string>(),
      };
      entry.rows.push(r);
      entry.labels.set(`${g.product.id}::${r.asin}`, g.product.name);
      byMarketplace.set(r.marketplace, entry);
    }
  }
  return [...byMarketplace.entries()].map(([mp, { rows, labels }]) => {
    const sum = rows.reduce(
      (acc, r) => ({
        units: acc.units + r.units,
        sales: acc.sales + r.sales,
        promo: acc.promo + r.promo,
        refundsAmount: acc.refundsAmount + r.refundsAmount,
        refundsCount: acc.refundsCount + r.refundsCount,
        amazonFees: acc.amazonFees + r.amazonFees,
        cogs: acc.cogs + r.cogs,
        stock: acc.stock + r.stock,
        grossProfit: acc.grossProfit + r.grossProfit,
        netProfit: acc.netProfit + r.netProfit,
        estimatedPayout: acc.estimatedPayout + r.estimatedPayout,
        vatAmount: (acc.vatAmount ?? 0) + (r.vatAmount ?? 0),
        adsSpend:
          r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      }),
      {
        units: 0,
        sales: 0,
        promo: 0,
        refundsAmount: 0,
        refundsCount: 0,
        amazonFees: 0,
        cogs: 0,
        stock: 0,
        grossProfit: 0,
        netProfit: 0,
        estimatedPayout: 0,
        vatAmount: 0,
        adsSpend: null as number | null,
      },
    );
    const aggregate: ProductPerformanceRow = {
      identifierId: "",
      asin: "",
      marketplace: mp,
      sku: null,
      bsr: null,
      hasRealFees: rows.every((r) => r.hasRealFees),
      hasRealCogs: rows.every((r) => r.hasRealCogs),
      hasStockData: rows.every((r) => r.hasStockData),
      refundPct: sum.sales > 0 ? sum.refundsAmount / sum.sales : 0,
      realAcos:
        sum.adsSpend !== null && sum.sales > 0
          ? sum.adsSpend / sum.sales
          : null,
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
        const productName =
          [...labels.entries()].find(([k]) => k.endsWith(`::${r.asin}`))?.[1] ??
          r.asin;
        return { key: `${mp}-${r.asin}`, label: productName, metrics: r };
      }),
    };
  });
}

function buildRowsByBrand(groups: ProductPerformanceGroup[]): RowEntry[] {
  const byBrand = new Map<string, ProductPerformanceGroup[]>();
  for (const g of groups) {
    const brand = g.product.brand ?? "Senza marca";
    const list = byBrand.get(brand) ?? [];
    list.push(g);
    byBrand.set(brand, list);
  }
  return [...byBrand.entries()].map(([brand, brandGroups]) => {
    const sum = brandGroups.reduce(
      (acc, g) => ({
        units: acc.units + g.aggregate.units,
        sales: acc.sales + g.aggregate.sales,
        promo: acc.promo + g.aggregate.promo,
        refundsAmount: acc.refundsAmount + g.aggregate.refundsAmount,
        refundsCount: acc.refundsCount + g.aggregate.refundsCount,
        amazonFees: acc.amazonFees + g.aggregate.amazonFees,
        cogs: acc.cogs + g.aggregate.cogs,
        stock: acc.stock + g.aggregate.stock,
        grossProfit: acc.grossProfit + g.aggregate.grossProfit,
        netProfit: acc.netProfit + g.aggregate.netProfit,
        estimatedPayout: acc.estimatedPayout + g.aggregate.estimatedPayout,
        adsSpend:
          g.aggregate.adsSpend !== null
            ? (acc.adsSpend ?? 0) + g.aggregate.adsSpend
            : acc.adsSpend,
      }),
      {
        units: 0,
        sales: 0,
        promo: 0,
        refundsAmount: 0,
        refundsCount: 0,
        amazonFees: 0,
        cogs: 0,
        stock: 0,
        grossProfit: 0,
        netProfit: 0,
        estimatedPayout: 0,
        adsSpend: null as number | null,
      },
    );
    const aggregate: ProductPerformanceRow = {
      identifierId: "",
      asin: "",
      marketplace: "ALL",
      sku: null,
      bsr: null,
      hasRealFees: brandGroups.every((g) => g.aggregate.hasRealFees),
      hasRealCogs: brandGroups.every((g) => g.aggregate.hasRealCogs),
      hasStockData: brandGroups.every((g) => g.aggregate.hasStockData),
      refundPct: sum.sales > 0 ? sum.refundsAmount / sum.sales : 0,
      realAcos:
        sum.adsSpend !== null && sum.sales > 0
          ? sum.adsSpend / sum.sales
          : null,
      margin: sum.sales > 0 ? sum.netProfit / sum.sales : 0,
      roi: sum.cogs > 0 ? sum.netProfit / sum.cogs : 0,
      avgSellingPrice: sum.units > 0 ? sum.sales / sum.units : 0,
      ...sum,
    };
    return {
      key: `brand-${brand}`,
      label: brand,
      metrics: aggregate,
      children: brandGroups.map((g) => ({
        key: `brand-${brand}-${g.product.id}`,
        label: g.product.name,
        metrics: g.aggregate,
      })),
    };
  });
}

/** Merges already marketplace/channel-grouped rows (Amazon marketplaces +
 *  Shopify/Redcare channels) into one row per country, using the country
 *  code embedded in each channel's own marketplace string. A channel with
 *  no recognizable country (EBAY, TIKTOK, ...) keeps its own bucket. */
function buildRowsByCountry(
  amazonMarketplaceRows: RowEntry[],
  shopifyRows: RowEntry[],
): RowEntry[] {
  const byCountry = new Map<string, RowEntry[]>();
  for (const entry of [...amazonMarketplaceRows, ...shopifyRows]) {
    const country = countryOf(entry.metrics.marketplace);
    const list = byCountry.get(country) ?? [];
    list.push(entry);
    byCountry.set(country, list);
  }
  return [...byCountry.entries()].map(([country, entries]) => {
    const sum = entries.reduce(
      (acc, e) => ({
        units: acc.units + e.metrics.units,
        sales: acc.sales + e.metrics.sales,
        promo: acc.promo + e.metrics.promo,
        refundsAmount: acc.refundsAmount + e.metrics.refundsAmount,
        refundsCount: acc.refundsCount + e.metrics.refundsCount,
        amazonFees: acc.amazonFees + e.metrics.amazonFees,
        cogs: acc.cogs + e.metrics.cogs,
        stock: acc.stock + e.metrics.stock,
        grossProfit: acc.grossProfit + e.metrics.grossProfit,
        netProfit: acc.netProfit + e.metrics.netProfit,
        estimatedPayout: acc.estimatedPayout + e.metrics.estimatedPayout,
        adsSpend:
          e.metrics.adsSpend !== null
            ? (acc.adsSpend ?? 0) + e.metrics.adsSpend
            : acc.adsSpend,
      }),
      {
        units: 0,
        sales: 0,
        promo: 0,
        refundsAmount: 0,
        refundsCount: 0,
        amazonFees: 0,
        cogs: 0,
        stock: 0,
        grossProfit: 0,
        netProfit: 0,
        estimatedPayout: 0,
        adsSpend: null as number | null,
      },
    );
    const aggregate: ProductPerformanceRow = {
      identifierId: "",
      asin: "",
      marketplace: country,
      sku: null,
      bsr: null,
      hasRealFees: entries.every((e) => e.metrics.hasRealFees),
      hasRealCogs: entries.every((e) => e.metrics.hasRealCogs),
      hasStockData: entries.every((e) => e.metrics.hasStockData),
      refundPct: sum.sales > 0 ? sum.refundsAmount / sum.sales : 0,
      realAcos:
        sum.adsSpend !== null && sum.sales > 0
          ? sum.adsSpend / sum.sales
          : null,
      margin: sum.sales > 0 ? sum.netProfit / sum.sales : 0,
      roi: sum.cogs > 0 ? sum.netProfit / sum.cogs : 0,
      avgSellingPrice: sum.units > 0 ? sum.sales / sum.units : 0,
      ...sum,
    };
    return {
      key: `country-${country}`,
      label: KNOWN_COUNTRY_CODES.has(country)
        ? country
        : getMeta(country).label,
      metrics: aggregate,
      children: entries.map((e) => ({
        key: `country-${country}-${e.key}`,
        label: e.label,
        metrics: e.metrics,
      })),
    };
  });
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** CSV export of the top-level (parent) rows currently visible in the
 *  table — matches the desktop table's own column set (COLUMNS). */
export function buildProductsCsv(rows: RowEntry[]): string {
  const lines = rows.map((entry) => {
    const m = entry.metrics;
    return [
      entry.label,
      String(m.units),
      String(m.refundsCount),
      m.sales.toFixed(2),
      m.promo.toFixed(2),
      m.adsSpend !== null ? m.adsSpend.toFixed(2) : "",
      (m.refundPct * 100).toFixed(1),
      m.amazonFees.toFixed(2),
      m.cogs.toFixed(2),
      m.grossProfit.toFixed(2),
      m.netProfit.toFixed(2),
      m.estimatedPayout.toFixed(2),
      (m.margin * 100).toFixed(1),
      m.roi.toFixed(2),
      m.realAcos !== null ? (m.realAcos * 100).toFixed(1) : "",
      m.avgSellingPrice.toFixed(2),
      m.bsr !== null ? String(m.bsr) : "",
      String(m.stock),
    ]
      .map(csvField)
      .join(";");
  });
  return [COLUMNS.map(csvField).join(";"), ...lines].join("\n");
}

/** Inline-editable "IVA %" field for one identifier row — same crude-but-
 *  functional pattern as the existing "Sposta prodotto" affordance (no
 *  dedicated edit modal exists in this table yet). Commits on blur or Enter;
 *  an empty value clears the rate (sends null). */
function VatRateEditor({
  identifierId,
  initialRate,
  onSave,
}: {
  identifierId: string;
  initialRate: number | null | undefined;
  onSave: (identifierId: string, vatRate: number | null) => void;
}) {
  const [value, setValue] = useState(
    initialRate != null ? String(initialRate) : "",
  );

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

export default function ProductsPerformanceTable({
  groups,
  groupBy,
  onGroupByChange,
  onRenamed,
  onMoved,
  onVatRateChanged,
  shopifyMarketplaceRows,
  dateRange,
  marketplace,
  amazonAccountId,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetProductId, setTargetProductId] = useState("");
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    loadHiddenColumns(),
  );
  const [columnsPickerOpen, setColumnsPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("product");
  const [orders, setOrders] = useState<AmazonOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightReply, setInsightReply] = useState<string | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);

  const toggleColumn = (column: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.has(column) ? next.delete(column) : next.add(column);
      try {
        window.localStorage.setItem(
          HIDDEN_COLUMNS_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const rows =
    groupBy === "product"
      ? [...buildRowsByProduct(groups), ...(shopifyMarketplaceRows ?? [])]
      : groupBy === "brand"
        ? buildRowsByBrand(groups)
        : groupBy === "paese"
          ? buildRowsByCountry(
              buildRowsByMarketplace(groups),
              shopifyMarketplaceRows ?? [],
            )
          : [
              ...buildRowsByMarketplace(groups),
              ...(shopifyMarketplaceRows ?? []),
            ];

  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.children?.some((c) => c.label.toLowerCase().includes(q)),
    );
  })();

  const buildInsightContext = () => {
    const period = dateRange ? `${dateRange.from} → ${dateRange.to}` : "periodo corrente della dashboard";
    const mp = marketplace && marketplace !== "all" ? marketplace : "tutti i marketplace";
    const groupLabel = { marketplace: "Marketplace", product: "Prodotto", brand: "Brand", paese: "Paese" }[groupBy];
    return `Tabella Prodotti — periodo ${period}, marketplace: ${mp}, raggruppamento: ${groupLabel}, ${filteredRows.length} righe visibili.`;
  };

  const fetchInsight = async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const { reply } = await api.chat.send(
        [{ role: "user", content: INSIGHT_QUESTION }],
        buildInsightContext(),
      );
      setInsightReply(reply);
    } catch (err) {
      console.error("[ProductsPerformanceTable] Insight AI failed:", err);
      setInsightError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setInsightLoading(false);
    }
  };

  const handleInsightToggle = () => {
    const opening = !insightOpen;
    setInsightOpen(opening);
    if (opening && insightReply === null && !insightLoading) fetchInsight();
  };

  const handleExport = () => {
    const csv = buildProductsCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prodotti.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const asins = [
      ...new Set(
        groups.flatMap((g) => g.rows.map((r) => r.asin)).filter(Boolean),
      ),
    ];
    if (asins.length === 0) return;
    let cancelled = false;
    api.amazon
      .catalogImages(asins)
      .then((map) => {
        if (!cancelled) setImages(map);
      })
      .catch((err) =>
        console.error(
          "[ProductsPerformanceTable] Failed to load thumbnails:",
          err,
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const dateRangeFrom = dateRange?.from;
  const dateRangeTo = dateRange?.to;

  useEffect(() => {
    if (viewMode !== "orders" || !dateRangeFrom || !dateRangeTo) return;
    let cancelled = false;
    setOrdersLoading(true);
    const params: Record<string, string> = { from: dateRangeFrom, to: dateRangeTo };
    if (marketplace && marketplace !== "all") params.marketplace = marketplace;
    if (amazonAccountId) params.amazonAccountId = amazonAccountId;
    api.amazon
      .orders(params)
      .then((res) => {
        if (!cancelled) setOrders(res.orders);
      })
      .catch((err) =>
        console.error("[ProductsPerformanceTable] Failed to load orders:", err),
      )
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // dateRangeFrom/dateRangeTo (not the dateRange object) so a caller that
    // passes a fresh {from,to} literal every render — like page.tsx's JSX —
    // doesn't reopen this effect on every unrelated re-render.
  }, [viewMode, dateRangeFrom, dateRangeTo, marketplace, amazonAccountId]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
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

  const handleVatRateSave = async (
    identifierId: string,
    vatRate: number | null,
  ) => {
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
      await api.productPerformance.moveIdentifier(
        identifierId,
        targetProductId,
      );
      setMovingId(null);
      setTargetProductId("");
      onMoved();
    } catch (err) {
      console.error("[ProductsPerformanceTable] Move failed:", err);
      window.alert("Impossibile spostare il prodotto. Riprova.");
    }
  };

  const parentLabel = (entry: RowEntry, isOpen: boolean) => {
    // Only the "product" grouping maps one top-level row to exactly one
    // product with a stable representative ASIN — Marketplace/Paese/Brand
    // rows are cross-product aggregates, so no single thumbnail applies.
    const representativeAsin =
      groupBy === "product" ? entry.children?.[0]?.metrics.asin : undefined;
    const thumb = representativeAsin
      ? (images[representativeAsin] ??
        entry.children?.[0]?.metrics.imageUrl ??
        null)
      : null;
    return (
      <span className="inline-flex items-center">
        {groupBy === "product" &&
          (thumb ? (
            <img
              src={thumb}
              alt=""
              className="w-[20px] h-[20px] rounded-[4px] object-cover shrink-0 mr-1.5"
            />
          ) : (
            <div className="w-[20px] h-[20px] rounded-[4px] bg-bg-hover shrink-0 mr-1.5" />
          ))}
        <button
          aria-label={`Espandi ${entry.label}`}
          onClick={() => toggle(entry.key)}
          className="bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-inherit hover:text-accent-primary transition-colors"
        >
          {isOpen ? (
            <ChevronDown size={13} className="text-accent-primary" />
          ) : (
            <ChevronRight size={13} className="text-zinc-400" />
          )}
          {entry.label}
        </button>
        {groupBy === "product" && (
          <button
            title="Rinomina"
            onClick={() => handleRename(entry.key, entry.label)}
            className="ml-1.5 bg-transparent border-none cursor-pointer text-zinc-500 hover:text-accent-blue transition-colors"
          >
            <Pencil size={11} />
          </button>
        )}
      </span>
    );
  };

  const childLabel = (child: {
    key: string;
    label: string;
    metrics: ProductPerformanceRow;
  }) => {
    // Righe Amazon: cercate per ASIN nella mappa caricata da catalogImages().
    // Righe Shopify/Redcare (asin sempre "", niente lookup ASIN possibile):
    // il backend restituisce già l'imageUrl del prodotto su metrics.imageUrl.
    const thumb = images[child.metrics.asin] ?? child.metrics.imageUrl ?? null;
    return (
      <>
        <div className="ml-5 flex items-center gap-2">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="w-[22px] h-[22px] rounded-[5px] object-cover shrink-0"
            />
          ) : (
            <div className="w-[22px] h-[22px] rounded-[5px] bg-bg-hover shrink-0" />
          )}
          <span className="ml-1 text-zinc-500">
            <CornerDownRight size={11} className="inline text-zinc-400 mr-1" />
            {child.label} — <span>{child.metrics.asin}</span>
          </span>
        </div>
        {groupBy === "product" && (
          <button
            onClick={() => setMovingId(child.key)}
            className="ml-2 text-[10px] text-accent-blue bg-transparent border-none cursor-pointer underline"
          >
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
            <button
              onClick={() => handleMove(child.metrics.identifierId)}
              className="text-[10px] ml-1 text-zinc-300 hover:text-white"
            >
              OK
            </button>
          </span>
        )}
      </>
    );
  };

  return (
    <div className="bg-bg-card rounded-xl border border-bg-border text-zinc-300 shadow-sm overflow-hidden">
      <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 border-b border-bg-border/70">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
            <Table2 size={14} className="text-accent-blue" />
            Prodotti
          </span>
          <span className="hidden sm:inline text-[10px] text-zinc-500">
            Performance per canale e prodotto
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca..."
              className="h-8 w-40 rounded-lg border border-bg-border bg-bg-base pl-7 pr-2 text-xs text-zinc-300 outline-none focus:border-accent-primary"
            />
          </div>
          <div className="inline-flex rounded-lg border border-bg-border overflow-hidden text-xs font-medium">
            <button
              type="button"
              aria-pressed={viewMode === "product"}
              onClick={() => setViewMode("product")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${viewMode === "product" ? "bg-accent-primary/15 text-accent-primary" : "text-zinc-400 hover:bg-bg-hover"}`}
            >
              <Package size={13} /> Prodotto
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "orders"}
              onClick={() => setViewMode("orders")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border-l border-bg-border transition-colors ${viewMode === "orders" ? "bg-accent-primary/15 text-accent-primary" : "text-zinc-400 hover:bg-bg-hover"}`}
            >
              <ShoppingCart size={13} /> Ordini
            </button>
          </div>
          {viewMode === "product" && (
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
                <option value="brand">Brand</option>
                <option value="paese">Paese</option>
              </select>
            </label>
          )}
          <div className="relative">
            <button
              onClick={handleInsightToggle}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-bg-hover transition-colors"
            >
              <Sparkles size={13} /> Insight AI
            </button>
            {insightOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-80 max-h-96 overflow-y-auto rounded-lg border border-bg-border bg-bg-card shadow-xl p-3 text-[11.5px] text-zinc-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                    <Sparkles size={11} className="text-accent-primary" /> Insight AI
                  </span>
                  {!insightLoading && (insightReply || insightError) && (
                    <button
                      onClick={fetchInsight}
                      title="Rigenera"
                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-accent-primary transition-colors bg-transparent border-none cursor-pointer"
                    >
                      <RotateCcw size={11} /> Rigenera
                    </button>
                  )}
                </div>
                {insightLoading ? (
                  <div className="flex items-center gap-1.5 text-zinc-500 py-4 justify-center">
                    <Loader2 size={13} className="animate-spin text-accent-primary" /> Analizzando i dati…
                  </div>
                ) : insightError ? (
                  <p className="text-accent-red">{insightError}</p>
                ) : insightReply ? (
                  <div className="space-y-0.5">{renderMarkdown(insightReply)}</div>
                ) : null}
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-bg-hover transition-colors"
          >
            <Download size={13} /> Esporta
          </button>
          <div className="relative">
            <button
              onClick={() => setColumnsPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-bg-hover transition-colors"
            >
              <Columns3 size={13} /> Colonne
            </button>
            {columnsPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 max-h-72 overflow-y-auto rounded-lg border border-bg-border bg-bg-card shadow-xl p-2 space-y-1">
                {COLUMNS.slice(1).map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-300 rounded hover:bg-bg-hover cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(c)}
                      onChange={() => toggleColumn(c)}
                      aria-label={c}
                    />
                    {c}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {viewMode === "orders" ? (
        <div className="overflow-x-auto rounded-b-lg">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                <th className="px-2.5 py-2.5 font-medium">Data</th>
                <th className="px-2.5 py-2.5 font-medium">Ordine</th>
                <th className="px-2.5 py-2.5 font-medium">Marketplace</th>
                <th className="px-2.5 py-2.5 font-medium">Articoli</th>
                <th className="px-2.5 py-2.5 font-medium">Totale</th>
                <th className="px-2.5 py-2.5 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <PackageSearch
                      size={26}
                      className="mx-auto mb-2 text-zinc-400"
                    />
                    <p className="text-sm font-medium text-zinc-600">
                      {ordersLoading
                        ? "Caricamento ordini…"
                        : "Nessun ordine nel periodo selezionato"}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="border-b border-bg-border/60">
                    <td className="px-2.5 py-2.5">
                      {new Date(o.purchaseDate).toLocaleDateString("it-IT")}
                    </td>
                    <td className="px-2.5 py-2.5">{o.amazonOrderId}</td>
                    <td className="px-2.5 py-2.5">
                      {MARKETPLACE_LABEL[o.marketplace] ?? o.marketplace}
                    </td>
                    <td className="px-2.5 py-2.5">{o.items.length}</td>
                    <td className="px-2.5 py-2.5 font-semibold">
                      {fmtEur(o.itemTotal)}
                    </td>
                    <td className="px-2.5 py-2.5">{o.orderStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-b-lg">
          <table className="w-full min-w-[1540px] border-collapse text-[11.5px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-zinc-500 text-left bg-bg-hover/80 border-b border-bg-border">
                <th
                  className="sticky left-0 z-20 bg-bg-hover/95 px-2.5 py-1.5 font-semibold text-zinc-500"
                  rowSpan={2}
                >
                  Identità
                </th>
                {COLUMN_GROUPS.map(({ label, className, columns }) => {
                  const visibleCount = columns.filter(
                    (c) => !hiddenColumns.has(c),
                  ).length;
                  if (visibleCount === 0) return null;
                  return (
                    <th
                      key={label}
                      className={`px-2.5 py-1.5 text-center font-semibold ${className}`}
                      colSpan={visibleCount}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
              <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                {COLUMNS.slice(1)
                  .filter((c) => !hiddenColumns.has(c))
                  .map((c) => (
                    <th key={c} className="px-2.5 py-2.5 font-medium">
                      {c}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length - hiddenColumns.size}
                    className="py-14 text-center"
                  >
                    <PackageSearch
                      size={26}
                      className="mx-auto mb-2 text-zinc-400"
                    />
                    <p className="text-sm font-medium text-zinc-600">
                      Nessun dato nel periodo selezionato
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Prova a cambiare periodo o marketplace.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((entry) => {
                  const isOpen = expanded.has(entry.key);
                  return (
                    <Fragment key={entry.key}>
                      <MetricRow
                        label={parentLabel(entry, isOpen)}
                        metrics={entry.metrics}
                        hiddenColumns={hiddenColumns}
                      />
                      {isOpen &&
                        entry.children?.map((child) => (
                          <MetricRow
                            key={child.key}
                            label={childLabel(child)}
                            metrics={child.metrics}
                            isChild
                            hiddenColumns={hiddenColumns}
                            vatEditor={
                              child.metrics.identifierId ? (
                                <VatRateEditor
                                  identifierId={child.metrics.identifierId}
                                  initialRate={child.metrics.vatRate}
                                  onSave={handleVatRateSave}
                                />
                              ) : undefined
                            }
                          />
                        ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
