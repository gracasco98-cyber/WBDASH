"use client";
import { useEffect, useState } from "react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";
import {
  isAmazonChannel,
  amazonChannelCode,
} from "@/components/dashboard/FilterBar";
import type { PeriodPreset } from "@/context/PeriodContext";
import { api } from "@/lib/api";
import type { ProductPerformanceRow } from "@/lib/api";
import { formatDateToIso } from "@/lib/periodUtils";
import { getComparePeriod, calculateVariation } from "@/lib/compareUtils";
import { fmtEur, dash } from "./MetricRow";
import {
  CalendarDays,
  CalendarClock,
  CalendarRange,
  Sparkles,
  History,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

type DateRange = { from: string; to: string };
type Tile = {
  id: string;
  preset: PeriodPreset;
  label: string;
  headerBg: string;
  accent: string;
  Icon: typeof CalendarDays;
  /** Marks the "Proiezione mese" tile: its sales/profit are the month-to-date
   *  run-rate projected across the full month, not the raw fetched total. */
  isForecast?: boolean;
  /** When set, this tile always shows a comparison against this fixed range,
   *  independent of the global "Confronto" mode (GlobalPeriodSelector) —
   *  used by the monthly set, where every tile has one natural predecessor
   *  to compare against (Oggi vs Ieri, Mese in corso vs lo stesso numero di
   *  giorni del mese scorso, ...). */
  fixedCompareRange?: (current: DateRange) => DateRange | null;
};
type TileSetKey = "days" | "monthly";

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

const TILE_SETS: Record<TileSetKey, Tile[]> = {
  days: [
    {
      id: "today",
      preset: "today",
      label: "Oggi",
      headerBg: "#edf5ff",
      accent: "#2a78d6",
      Icon: CalendarDays,
    },
    {
      id: "yesterday",
      preset: "yesterday",
      label: "Ieri",
      headerBg: "#fff7e6",
      accent: "#d89000",
      Icon: History,
    },
    {
      id: "last7",
      preset: "last7",
      label: "7 giorni",
      headerBg: "#eaf8f2",
      accent: "#059669",
      Icon: CalendarRange,
    },
    {
      id: "last14",
      preset: "last14",
      label: "14 giorni",
      headerBg: "#f3effe",
      accent: "#7c3aed",
      Icon: CalendarClock,
    },
    {
      id: "last30",
      preset: "last30",
      label: "30 giorni",
      headerBg: "#edf5ff",
      accent: "#2a78d6",
      Icon: Sparkles,
    },
  ],
  monthly: [
    {
      id: "today",
      preset: "today",
      label: "Oggi",
      headerBg: "#edf5ff",
      accent: "#2a78d6",
      Icon: CalendarDays,
      fixedCompareRange: () => presetDateRange("yesterday"),
    },
    {
      id: "yesterday",
      preset: "yesterday",
      label: "Ieri",
      headerBg: "#fff7e6",
      accent: "#d89000",
      Icon: History,
      fixedCompareRange: () => {
        const today = new Date();
        const dayBeforeYesterday = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - 2,
        );
        return {
          from: formatDateToIso(dayBeforeYesterday),
          to: formatDateToIso(dayBeforeYesterday),
        };
      },
    },
    {
      id: "month_to_date",
      preset: "month_to_date",
      label: "Mese in corso",
      headerBg: "#eaf8f2",
      accent: "#059669",
      Icon: CalendarRange,
      fixedCompareRange: () => {
        const today = new Date();
        const firstOfLastMonth = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1,
        );
        const sameDayCountLastMonth = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          today.getDate(),
        );
        return {
          from: formatDateToIso(firstOfLastMonth),
          to: formatDateToIso(sameDayCountLastMonth),
        };
      },
    },
    {
      id: "forecast",
      preset: "month_to_date",
      label: "Proiezione mese",
      headerBg: "#f3effe",
      accent: "#7c3aed",
      Icon: TrendingUp,
      isForecast: true,
      fixedCompareRange: () => presetDateRange("last_month"),
    },
    {
      id: "last_month",
      preset: "last_month",
      label: "Mese scorso",
      headerBg: "#edf5ff",
      accent: "#2a78d6",
      Icon: Sparkles,
      fixedCompareRange: () => {
        const today = new Date();
        const firstOfMonthBeforeLast = new Date(
          today.getFullYear(),
          today.getMonth() - 2,
          1,
        );
        const lastOfMonthBeforeLast = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          0,
        );
        return {
          from: formatDateToIso(firstOfMonthBeforeLast),
          to: formatDateToIso(lastOfMonthBeforeLast),
        };
      },
    },
  ],
};

function presetDateRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (preset) {
    case "today":
      return { from: formatDateToIso(today), to: formatDateToIso(today) };
    case "yesterday":
      return {
        from: formatDateToIso(daysAgo(1)),
        to: formatDateToIso(daysAgo(1)),
      };
    case "last7":
      return { from: formatDateToIso(daysAgo(6)), to: formatDateToIso(today) };
    case "last14":
      return { from: formatDateToIso(daysAgo(13)), to: formatDateToIso(today) };
    case "last30":
      return { from: formatDateToIso(daysAgo(29)), to: formatDateToIso(today) };
    case "month_to_date":
      return {
        from: formatDateToIso(
          new Date(today.getFullYear(), today.getMonth(), 1),
        ),
        to: formatDateToIso(today),
      };
    case "last_month":
      return {
        from: formatDateToIso(
          new Date(today.getFullYear(), today.getMonth() - 1, 1),
        ),
        to: formatDateToIso(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    default:
      return { from: formatDateToIso(today), to: formatDateToIso(today) };
  }
}

function tileDateLabel(tile: Tile): string {
  const { preset, isForecast } = tile;
  const format = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
    });
  if (isForecast) {
    // The forecast projects across the whole month, not just the
    // month-to-date range its data comes from — show the full month's span.
    const today = new Date();
    const from = formatDateToIso(
      new Date(today.getFullYear(), today.getMonth(), 1),
    );
    const to = formatDateToIso(
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    );
    return `${format(from)} – ${format(to)} (stima)`;
  }
  const { from, to } = presetDateRange(preset);
  if (preset === "today") return `Oggi · ${format(to)}`;
  if (preset === "yesterday") return `Ieri · ${format(to)}`;
  return `${format(from)} – ${format(to)}`;
}

function VariationBadge({
  variation,
  dark,
}: {
  variation: { percentage: number; isPositive: boolean } | null;
  dark?: boolean;
}) {
  if (!variation) {
    return (
      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-normal ${dark ? "bg-bg-hover normal-case text-zinc-500" : "bg-white/70 text-zinc-500"}`}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-normal ${dark ? "normal-case" : ""} ${
        variation.isPositive
          ? "bg-emerald-500/15 text-emerald-600"
          : "bg-red-500/15 text-red-600"
      }`}
    >
      {variation.isPositive ? "+" : ""}
      {variation.percentage.toFixed(1)}%
    </span>
  );
}

/** Plain SVG polyline — the whole daily trend for a multi-day tile is a
 *  handful of points, not worth pulling in a charting library for. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 100, h = 24;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg data-sparkline width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Exported for direct unit testing: the hasRealFees / hasRealCogs / hasStockData
 *  flags it computes are not surfaced in this component's UI, so they are
 *  otherwise unobservable. */
export function sumAggregate(
  rows: ProductPerformanceRow[],
): ProductPerformanceRow | null {
  if (rows.length === 0) return null;
  // Explicit zeroed initial value — reduce() without one uses rows[0] as the
  // seed and silently leaves every field it doesn't touch at row 0's value
  // instead of summing it, which is wrong for a multi-row aggregate.
  const base = rows.reduce(
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
      vatAmount: acc.vatAmount + (r.vatAmount ?? 0),
      adsSpend:
        r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      // AND-logic with a `true` seed, matching resolveProductPerformance's
      // aggregate and ProductsPerformanceTable's buildRowsByMarketplace: the
      // total only claims "verified" when EVERY contributing product is. OR-logic
      // inverts exactly the safeguard these flags exist to provide.
      hasRealFees: acc.hasRealFees && r.hasRealFees,
      hasRealCogs: acc.hasRealCogs && r.hasRealCogs,
      hasStockData: acc.hasStockData && r.hasStockData,
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
      hasRealFees: true,
      hasRealCogs: true,
      hasStockData: true,
    },
  );
  return {
    identifierId: "",
    asin: "",
    marketplace: "ALL",
    sku: null,
    bsr: null,
    ...base,
    refundPct: base.sales > 0 ? base.refundsAmount / base.sales : 0,
    realAcos:
      base.adsSpend !== null && base.sales > 0
        ? base.adsSpend / base.sales
        : null,
    margin: base.sales > 0 ? base.netProfit / base.sales : 0,
    roi: base.cogs > 0 ? base.netProfit / base.cogs : 0,
    avgSellingPrice: base.units > 0 ? base.sales / base.units : 0,
  };
}

export default function PeriodTiles() {
  const { state, setPreset } = usePeriodFilter();
  const [tileSet, setTileSet] = useState<TileSetKey>("days");
  const activeTiles = TILE_SETS[tileSet];
  const { marketplace: globalMarketplace } = useMarketplaceFilter();
  // Same translation the home page applies before hitting the product-performance
  // endpoint: only Amazon channels narrow the scope, everything else is "all".
  const productMarketplace = isAmazonChannel(globalMarketplace)
    ? (amazonChannelCode(globalMarketplace) ?? "all")
    : globalMarketplace.startsWith("REDCARE_")
      ? globalMarketplace
      : "all";
  // Keyed by tile.id, not tile.preset — the monthly set's "Proiezione mese"
  // tile shares its preset (month_to_date) with "Mese in corso" but needs
  // its own comparison target, so preset alone is no longer a unique key.
  const [totals, setTotals] = useState<
    Record<string, ProductPerformanceRow | null>
  >({});
  // Shopify (Redcare/Temu/eBay/...) contribution to the tiles. Redcare Ads are
  // marketplace/day costs; fee and COGS figures remain unavailable here.
  const [shopifyTotals, setShopifyTotals] = useState<
    Record<
      string,
      { sales: number; units: number; netProfit: number; adSpend: number; vatAmount: number; redcareFee: number }
    >
  >({});
  // Redcare Ads and orders can arrive after the page was opened. Refresh the
  // marketplace slice periodically so today's VAT, spend and margin are not
  // frozen at the initial render.
  const [liveTick, setLiveTick] = useState(0);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const refresh = () => setLiveTick((tick) => tick + 1);
    window.addEventListener("wbdash:refresh-period-tiles", refresh);
    // Safety net when an SSE connection is temporarily unavailable.
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("wbdash:refresh-period-tiles", refresh);
      window.clearInterval(timer);
    };
  }, []);
  // Populated for any tile that needs a comparison: either the global
  // "Confronto" mode (GlobalPeriodSelector) for the daily set, or a tile's
  // own fixedCompareRange for the monthly set (always on, e.g. "Oggi" vs
  // "Ieri"), fetched additively alongside its own range.
  const [compareTotals, setCompareTotals] = useState<
    Record<string, ProductPerformanceRow | null>
  >({});
  const { selectedAccountId } = useAmazonAccount();
  // Main dashboard default: when the user hasn't drilled into one specific
  // Amazon account, sum every active account instead of leaving the tiles
  // empty (the backend otherwise refuses to guess which account to show —
  // see amazon-account.middleware.ts). Picking one account from the
  // selector still narrows these tiles to just that account.
  const amazonAccountId = selectedAccountId ?? "ALL";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          activeTiles.map(async ({ id, preset }) => {
            const { from, to } = presetDateRange(preset);
            const { groups } = await api.productPerformance.get({
              marketplace: productMarketplace,
              from,
              to,
              amazonAccountId,
            });
            return [id, sumAggregate(groups.map((g) => g.aggregate))] as const;
          }),
        );
        if (!cancelled) {
          setTotals(Object.fromEntries(results));
          setLastUpdated(new Date());
          setRefreshing(false);
        }
      } catch (err) {
        if (!cancelled)
          console.error("[PeriodTiles] Failed to load period tiles:", err);
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productMarketplace, amazonAccountId, activeTiles, manualRefresh, liveTick]);

  useEffect(() => {
    // Hidden when an Amazon-specific channel is selected, matching the same
    // "solo canale Amazon" scoping the home page's other Shopify fetches use.
    if (isAmazonChannel(globalMarketplace)) {
      setShopifyTotals({});
      return;
    }
    const shopifyMarketplace =
      globalMarketplace === "all" ? undefined : globalMarketplace;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          activeTiles.map(async ({ id, preset }) => {
            // Reuse the exact same browser-resolved from/to the Amazon fetch
            // above uses (presetDateRange), instead of sending just the
            // preset name and letting the server resolve "today" on its own
            // clock — two independently-resolved "today"s can disagree right
            // at a day boundary, attributing this card's combined profit
            // figure to the wrong calendar day (see PeriodTiles.test.tsx).
            const { from, to } = presetDateRange(preset);
            const productResult = await api.products({
              filter: "custom",
              from,
              to,
              ...(shopifyMarketplace
                ? { marketplace: shopifyMarketplace }
                : {}),
            });

            // Redcare Ads are stored as daily, marketplace-specific costs.
            // Read that source explicitly for the tiles instead of relying only
            // on the aggregate /api/products KPI (which may be served from a
            // stale deployment or an older response shape).  A selected
            // Redcare channel is scoped to itself; the unfiltered dashboard
            // includes both Redcare IT and DE.  Other Shopify channels must not
            // inherit Redcare costs.
            const canLoadRedcareAds =
              globalMarketplace === "all" ||
              globalMarketplace === "REDCARE_IT" ||
              globalMarketplace === "REDCARE_DE";
            let directAdSpend: number | null = null;
            const listAdSpend = api.marketingRedcare?.listAdSpend;
            if (canLoadRedcareAds && listAdSpend) {
              try {
                const adResult = await listAdSpend({
                  from,
                  to,
                  ...(globalMarketplace === "REDCARE_IT" ||
                  globalMarketplace === "REDCARE_DE"
                    ? { marketplace: globalMarketplace }
                    : {}),
                });
                directAdSpend = Number(adResult.total);
              } catch {
                // Keep the aggregate KPI fallback below when the dedicated
                // endpoint is temporarily unavailable.
              }
            }

            const { products, kpis } = productResult;
            const reportedAdSpend =
              directAdSpend ?? kpis.redcareAdSpend ?? kpis.totalAdSpend ?? 0;
            const netProfit =
              directAdSpend === null
                ? kpis.totalNet
                : kpis.totalNet +
                  (kpis.redcareAdSpend ?? kpis.totalAdSpend ?? 0) -
                  directAdSpend;
            return [
              id,
              {
                // Use the order-level KPI for revenue so the card includes the
                // same Shopify/Redcare population as the dashboard summary
                // (shipping/discount adjustments and test-order exclusion).
                sales: kpis.totalGross,
                units: products.reduce((s, p) => s + p.unitsSold, 0),
                netProfit,
                adSpend: reportedAdSpend,
                vatAmount: Number(kpis.redcareVat ?? 0),
                redcareFee: Number(kpis.redcareFee ?? 0),
              },
            ] as const;
          }),
        );
        if (!cancelled) {
          setShopifyTotals(Object.fromEntries(results));
          setLastUpdated(new Date());
          setRefreshing(false);
        }
      } catch (err) {
        if (!cancelled)
          console.error("[PeriodTiles] Failed to load Shopify totals:", err);
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [globalMarketplace, activeTiles, liveTick, manualRefresh]);

  useEffect(() => {
    const tilesNeedingCompare = activeTiles.filter(
      (t) => t.fixedCompareRange || state.compareMode !== "none",
    );
    if (tilesNeedingCompare.length === 0) {
      setCompareTotals({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          tilesNeedingCompare.map(async ({ id, preset, fixedCompareRange }) => {
            const current = presetDateRange(preset);
            const compare = fixedCompareRange
              ? fixedCompareRange(current)
              : getComparePeriod(state.compareMode, current);
            if (!compare) return [id, null] as const;
            const { groups } = await api.productPerformance.get({
              marketplace: productMarketplace,
              from: compare.from,
              to: compare.to,
              amazonAccountId,
            });
            return [id, sumAggregate(groups.map((g) => g.aggregate))] as const;
          }),
        );
        if (!cancelled) setCompareTotals(Object.fromEntries(results));
      } catch (err) {
        if (!cancelled)
          console.error("[PeriodTiles] Failed to load comparison totals:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productMarketplace, amazonAccountId, state.compareMode, activeTiles]);

  // Daily revenue trend for multi-day tiles only — a single-day tile (Oggi,
  // Ieri) has nothing to draw a line across. Amazon-only (this endpoint has
  // no Shopify equivalent), same tradeoff as the comparison badges above.
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  useEffect(() => {
    const multiDayTiles = activeTiles.filter((t) => {
      const { from, to } = presetDateRange(t.preset);
      return from !== to;
    });
    if (multiDayTiles.length === 0) { setSparklines({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          multiDayTiles.map(async ({ id, preset }) => {
            const { from, to } = presetDateRange(preset);
            const points = await api.amazon.timeseries({ marketplace: productMarketplace, from, to });
            return [id, points.map((p) => p.revenue)] as const;
          })
        );
        if (!cancelled) setSparklines(Object.fromEntries(results));
      } catch (err) {
        if (!cancelled) console.error("[PeriodTiles] Failed to load sparklines:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [productMarketplace, activeTiles]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-500">
          <CheckCircle2 size={13} className={refreshing ? "text-amber-500" : "text-emerald-500"} />
          <span className="truncate">
            {refreshing
              ? "Aggiornamento in corso…"
              : lastUpdated
                ? `Dati aggiornati alle ${lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                : "In attesa di sincronizzazione"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Aggiorna dati"
            title="Aggiorna dati"
            onClick={() => {
              setRefreshing(true);
              setManualRefresh((value) => value + 1);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-bg-hover hover:text-accent-primary"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => setTileSet("days")}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tileSet === "days"
                ? "bg-accent-primary/15 text-accent-primary"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Giornaliero
          </button>
          <button
            type="button"
            onClick={() => setTileSet("monthly")}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tileSet === "monthly"
                ? "bg-accent-primary/15 text-accent-primary"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Mensile
          </button>
        </div>
      </div>
      <div className="flex w-full snap-x snap-mandatory gap-2.5 overflow-x-auto px-0.5 pb-2 scrollbar-hide sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible lg:grid-cols-5">
        {activeTiles.map((tile) => {
          const { id, preset, label, headerBg, accent, Icon, isForecast } =
            tile;
          const rawTotalRow = totals[id];
          const rawShopifyRow = shopifyTotals[id];
          // "Proiezione mese": linearly projects the month-to-date run-rate
          // across the full month (mtd / giorni trascorsi * giorni nel mese) —
          // a naive run-rate forecast, not a seasonally-adjusted model.
          const today = new Date();
          const forecastMultiplier = isForecast
            ? daysInMonth(today.getFullYear(), today.getMonth()) /
              today.getDate()
            : 1;
          const scaleAmazonRow = (
            row: ProductPerformanceRow | null | undefined,
          ) => {
            if (!row || forecastMultiplier === 1) return row;
            return {
              ...row,
              sales: row.sales * forecastMultiplier,
              units: Math.round(row.units * forecastMultiplier),
              refundsCount: Math.round(row.refundsCount * forecastMultiplier),
              amazonFees: row.amazonFees * forecastMultiplier,
              cogs: row.cogs * forecastMultiplier,
              netProfit: row.netProfit * forecastMultiplier,
              estimatedPayout: row.estimatedPayout * forecastMultiplier,
              vatAmount: (row.vatAmount ?? 0) * forecastMultiplier,
              adsSpend:
                row.adsSpend !== null
                  ? row.adsSpend * forecastMultiplier
                  : null,
            };
          };
          const scaleShopifyRow = (row: typeof rawShopifyRow) => {
            if (!row || forecastMultiplier === 1) return row;
            return {
              sales: row.sales * forecastMultiplier,
              units: Math.round(row.units * forecastMultiplier),
              netProfit: row.netProfit * forecastMultiplier,
              adSpend: row.adSpend * forecastMultiplier,
              vatAmount: row.vatAmount * forecastMultiplier,
              redcareFee: row.redcareFee * forecastMultiplier,
            };
          };
          const totalRow = scaleAmazonRow(rawTotalRow);
          const shopifyRow = scaleShopifyRow(rawShopifyRow);
          const hasAny = totalRow != null || shopifyRow != null;
          const combinedSales =
            (totalRow?.sales ?? 0) + (shopifyRow?.sales ?? 0);
          const combinedUnits =
            (totalRow?.units ?? 0) + (shopifyRow?.units ?? 0);
          const combinedNetProfit =
            (totalRow?.netProfit ?? 0) + (shopifyRow?.netProfit ?? 0);
          const combinedAdSpend =
            (totalRow?.adsSpend ?? 0) + (shopifyRow?.adSpend ?? 0);
          const combinedVat =
            (totalRow?.vatAmount ?? 0) + (shopifyRow?.vatAmount ?? 0);
          const vatLabel =
            globalMarketplace === "REDCARE_IT"
              ? "IVA Redcare"
              : isAmazonChannel(globalMarketplace)
                ? "IVA Amazon"
                : "VAT totale";
          const vatDisplay =
            globalMarketplace === "REDCARE_IT"
              ? shopifyRow?.vatAmount ?? 0
              : isAmazonChannel(globalMarketplace)
                ? totalRow?.vatAmount ?? 0
                : combinedVat;
          const combinedCosts =
            (totalRow?.amazonFees ?? 0) +
            (totalRow?.cogs ?? 0) +
            combinedAdSpend +
            (shopifyRow?.redcareFee ?? 0);
          const active = state.preset === preset;
          // Amazon-only on both sides (no Shopify comparison fetch, to keep
          // this addition to a single extra request per tile) — close enough
          // for a directional badge, not meant to be penny-accurate. The
          // monthly set's fixedCompareRange tiles always compare regardless
          // of the global "Confronto" mode.
          const compareRow =
            tile.fixedCompareRange || state.compareMode !== "none"
              ? compareTotals[id]
              : undefined;
          const salesVariation = compareRow
            ? calculateVariation(totalRow?.sales ?? 0, compareRow.sales)
            : null;
          const profitVariation = compareRow
            ? calculateVariation(totalRow?.netProfit ?? 0, compareRow.netProfit)
            : null;
          return (
            <button
              key={id}
              aria-label={label}
              aria-pressed={active}
              onClick={() => setPreset(preset)}
              className={`group h-auto min-h-0 w-[255px] shrink-0 snap-start text-left rounded-[13px] overflow-hidden p-0 cursor-pointer border transition-all bg-bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 flex flex-col sm:w-auto sm:min-w-0 sm:shrink ${
                active ? "border-accent-primary shadow-sm" : "border-bg-border"
              }`}
            >
              <div
                className="w-full px-3 py-2 border-t-2 border-b border-bg-border/70"
                style={{ backgroundColor: headerBg, borderTopColor: accent }}
              >
                <div
                  className="flex items-center gap-2 font-semibold text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: accent }}
                >
                  <span className="hidden sm:inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/70 border border-white/80">
                    <Icon size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">{tileDateLabel(tile)}</span>
                </div>
              </div>
              <div className="flex w-full flex-none flex-col gap-2 px-2.5 py-2.5">
                <div className="rounded-[9px] border border-bg-border/70 bg-accent-blue/10 px-2.5 py-2.5">
                  <div
                    className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: accent }}
                  >
                    <span>Ricavi netti</span>
                    <VariationBadge variation={salesVariation} />
                  </div>
                  <div className="text-[22px] leading-tight font-bold text-zinc-100 tabular-nums mt-1">
                    {hasAny ? fmtEur(combinedSales) : "—"}
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                    <span>
                      {hasAny ? `${totalRow?.refundsCount ?? 0} resi` : "—"}
                    </span>
                    <span>{hasAny ? `${combinedUnits} unità` : "—"}</span>
                  </div>
                  {sparklines[id] && <div className="mt-1.5"><Sparkline values={sparklines[id]} color={accent} /></div>}
                </div>
                <div className="rounded-[9px] border border-bg-border/70 bg-bg-hover/30 px-2.5 py-2.5">
                  <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase tracking-[0.08em]">
                    <span>Profitto netto</span>
                    <VariationBadge variation={profitVariation} dark />
                  </div>
                  <div
                    className={`text-[17px] font-bold tabular-nums mt-1 ${combinedNetProfit < 0 ? "text-accent-red" : "text-accent-primary"}`}
                  >
                    {hasAny ? fmtEur(combinedNetProfit) : "—"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[9px] border border-bg-border/70 bg-bg-hover/30 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">
                      Costi
                    </div>
                    <div className="text-[11px] font-semibold tabular-nums text-zinc-300">
                      {hasAny ? fmtEur(combinedCosts) : "—"}
                    </div>
                  </div>
                  <div className="rounded-[9px] border border-bg-border/70 bg-bg-hover/30 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">
                      {vatLabel}
                    </div>
                    <div className="text-[11px] font-semibold tabular-nums text-zinc-300">
                      {hasAny ? fmtEur(vatDisplay) : "—"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] px-0.5">
                  <div>
                    <div className="text-zinc-500 text-[10px]">Unità</div>
                    <div className="text-zinc-300 tabular-nums">
                      {hasAny ? combinedUnits : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-[10px]">Resi</div>
                    <div className="text-zinc-300 tabular-nums">
                      {totalRow ? totalRow.refundsCount : "—"}
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-bg-border">
                    <div className="text-zinc-500 text-[10px]">Ads</div>
                    <div className="text-zinc-300 tabular-nums">
                      {hasAny ? dash(combinedAdSpend, fmtEur) : "—"}
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-bg-border">
                    <div className="text-zinc-500 text-[10px]">
                      Payout stimato
                    </div>
                    <div className="text-zinc-300 tabular-nums">
                      {totalRow ? fmtEur(totalRow.estimatedPayout) : "—"}
                    </div>
                  </div>
                  <div>
                    {globalMarketplace === "all" ? (
                      <div className="space-y-1">
                        <div>
                          <div className="text-zinc-500 text-[10px]">Fee Amazon</div>
                          <div className="text-zinc-300 tabular-nums">{totalRow ? fmtEur(totalRow.amazonFees) : "—"}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 text-[10px]">Fee Redcare (15%)</div>
                          <div className="text-zinc-300 tabular-nums">{shopifyRow ? fmtEur(shopifyRow.redcareFee) : "—"}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-zinc-500 text-[10px]">
                          {globalMarketplace === "REDCARE_IT" ? "Fee Redcare (15%)" : "Fee Amazon"}
                        </div>
                        <div className="text-zinc-300 tabular-nums">
                          {globalMarketplace === "REDCARE_IT"
                            ? shopifyRow ? fmtEur(shopifyRow.redcareFee) : "—"
                            : totalRow ? fmtEur(totalRow.amazonFees) : "—"}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
