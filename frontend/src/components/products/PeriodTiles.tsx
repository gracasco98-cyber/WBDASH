"use client";
import { useEffect, useState } from "react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import type { PeriodPreset } from "@/context/PeriodContext";
import { api } from "@/lib/api";
import type { ProductPerformanceRow } from "@/lib/api";
import { formatDateToIso } from "@/lib/periodUtils";
import { fmtEur, dash } from "./MetricRow";
import { CalendarDays, CalendarClock, CalendarRange, Sparkles, History } from "lucide-react";

const TILES: { preset: PeriodPreset; label: string; headerBg: string; accent: string; Icon: typeof CalendarDays }[] = [
  { preset: "today", label: "Oggi", headerBg: "#edf5ff", accent: "#2a78d6", Icon: CalendarDays },
  { preset: "yesterday", label: "Ieri", headerBg: "#fff7e6", accent: "#d89000", Icon: History },
  { preset: "last7", label: "7 giorni", headerBg: "#eaf8f2", accent: "#059669", Icon: CalendarRange },
  { preset: "last14", label: "14 giorni", headerBg: "#f3effe", accent: "#7c3aed", Icon: CalendarClock },
  { preset: "last30", label: "30 giorni", headerBg: "#edf5ff", accent: "#2a78d6", Icon: Sparkles },
];

function presetDateRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case "today": return { from: formatDateToIso(today), to: formatDateToIso(today) };
    case "yesterday": return { from: formatDateToIso(daysAgo(1)), to: formatDateToIso(daysAgo(1)) };
    case "last7": return { from: formatDateToIso(daysAgo(6)), to: formatDateToIso(today) };
    case "last14": return { from: formatDateToIso(daysAgo(13)), to: formatDateToIso(today) };
    case "last30": return { from: formatDateToIso(daysAgo(29)), to: formatDateToIso(today) };
    default: return { from: formatDateToIso(today), to: formatDateToIso(today) };
  }
}

function tileDateLabel(preset: PeriodPreset): string {
  const { from, to } = presetDateRange(preset);
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  if (preset === "today") return `Oggi · ${format(to)}`;
  if (preset === "yesterday") return `Ieri · ${format(to)}`;
  return `${format(from)} – ${format(to)}`;
}

/** Exported for direct unit testing: the hasRealFees / hasRealCogs / hasStockData
 *  flags it computes are not surfaced in this component's UI, so they are
 *  otherwise unobservable. */
export function sumAggregate(rows: ProductPerformanceRow[]): ProductPerformanceRow | null {
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
      adsSpend: r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      // AND-logic with a `true` seed, matching resolveProductPerformance's
      // aggregate and ProductsPerformanceTable's buildRowsByMarketplace: the
      // total only claims "verified" when EVERY contributing product is. OR-logic
      // inverts exactly the safeguard these flags exist to provide.
      hasRealFees: acc.hasRealFees && r.hasRealFees,
      hasRealCogs: acc.hasRealCogs && r.hasRealCogs,
      hasStockData: acc.hasStockData && r.hasStockData,
    }),
    { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, vatAmount: 0, adsSpend: null as number | null, hasRealFees: true, hasRealCogs: true, hasStockData: true }
  );
  return {
    identifierId: "", asin: "", marketplace: "ALL", sku: null, bsr: null,
    ...base,
    refundPct: base.sales > 0 ? base.refundsAmount / base.sales : 0,
    realAcos: base.adsSpend !== null && base.sales > 0 ? base.adsSpend / base.sales : null,
    margin: base.sales > 0 ? base.netProfit / base.sales : 0,
    roi: base.cogs > 0 ? base.netProfit / base.cogs : 0,
    avgSellingPrice: base.units > 0 ? base.sales / base.units : 0,
  };
}

export default function PeriodTiles() {
  const { state, setPreset } = usePeriodFilter();
  const { marketplace: globalMarketplace } = useMarketplaceFilter();
  // Same translation the home page applies before hitting the product-performance
  // endpoint: only Amazon channels narrow the scope, everything else is "all".
  const productMarketplace = isAmazonChannel(globalMarketplace) ? (amazonChannelCode(globalMarketplace) ?? "all") : "all";
  const [totals, setTotals] = useState<Partial<Record<PeriodPreset, ProductPerformanceRow | null>>>({});
  // Shopify (Redcare/Temu/eBay/...) contribution to the tiles.  `netProfit`
  // is the Shopify order net amount (after refunds); no fee/COGS/ads figure is
  // fabricated because those costs are not tracked in the Shopify schema.
  const [shopifyTotals, setShopifyTotals] = useState<Partial<Record<PeriodPreset, { sales: number; units: number; netProfit: number }>>>({});
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
          TILES.map(async ({ preset }) => {
            const { from, to } = presetDateRange(preset);
            const { groups } = await api.productPerformance.get({ marketplace: productMarketplace, from, to, amazonAccountId });
            return [preset, sumAggregate(groups.map((g) => g.aggregate))] as const;
          })
        );
        if (!cancelled) setTotals(Object.fromEntries(results));
      } catch (err) {
        if (!cancelled) console.error("[PeriodTiles] Failed to load period tiles:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [productMarketplace, amazonAccountId]);

  useEffect(() => {
    // Hidden when an Amazon-specific channel is selected, matching the same
    // "solo canale Amazon" scoping the home page's other Shopify fetches use.
    if (isAmazonChannel(globalMarketplace)) { setShopifyTotals({}); return; }
    const shopifyMarketplace = globalMarketplace === "all" ? undefined : globalMarketplace;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          TILES.map(async ({ preset }) => {
            // Reuse the exact same browser-resolved from/to the Amazon fetch
            // above uses (presetDateRange), instead of sending just the
            // preset name and letting the server resolve "today" on its own
            // clock — two independently-resolved "today"s can disagree right
            // at a day boundary, attributing this card's combined profit
            // figure to the wrong calendar day (see PeriodTiles.test.tsx).
            const { from, to } = presetDateRange(preset);
            const { products, kpis } = await api.products({
              filter: "custom",
              from,
              to,
              ...(shopifyMarketplace ? { marketplace: shopifyMarketplace } : {}),
            });
            return [preset, {
              // Use the order-level KPI for revenue so the card includes the
              // same Shopify/Redcare population as the dashboard summary
              // (shipping/discount adjustments and test-order exclusion).
              sales: kpis.totalGross,
              units: products.reduce((s, p) => s + p.unitsSold, 0),
              netProfit: kpis.totalNet,
            }] as const;
          })
        );
        if (!cancelled) setShopifyTotals(Object.fromEntries(results));
      } catch (err) {
        if (!cancelled) console.error("[PeriodTiles] Failed to load Shopify totals:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [globalMarketplace]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {TILES.map(({ preset, label, headerBg, accent, Icon }) => {
        const totalRow = totals[preset];
        const shopifyRow = shopifyTotals[preset];
        const hasAny = totalRow != null || shopifyRow != null;
        const combinedSales = (totalRow?.sales ?? 0) + (shopifyRow?.sales ?? 0);
        const combinedUnits = (totalRow?.units ?? 0) + (shopifyRow?.units ?? 0);
        const combinedNetProfit = (totalRow?.netProfit ?? 0) + (shopifyRow?.netProfit ?? 0);
        const active = state.preset === preset;
        return (
          <button
            key={preset}
            aria-label={label}
            aria-pressed={active}
            onClick={() => setPreset(preset)}
            className={`group text-left rounded-xl overflow-hidden p-0 cursor-pointer border transition-all bg-bg-card hover:shadow-md hover:-translate-y-0.5 flex flex-col ${
              active ? "border-accent-primary shadow-sm" : "border-bg-border"
            }`}
          >
            <div className="px-3.5 py-2.5 border-t-2 border-b border-bg-border/70" style={{ backgroundColor: headerBg, borderTopColor: accent }}>
              <div className="flex items-center gap-2 font-semibold text-[11px] uppercase tracking-[0.08em]" style={{ color: accent }}>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/70 border border-white/80">
                  <Icon size={13} strokeWidth={2.2} />
                </span>
                <span className="truncate">{tileDateLabel(preset)}</span>
              </div>
            </div>
            <div className="px-3.5 py-3 flex-1 flex flex-col gap-2.5">
              <div className="rounded-lg border border-bg-border/70 bg-bg-hover/40 px-3 py-2.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>
                  <span>Ricavi netti</span>
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-medium tracking-normal text-zinc-500">—</span>
                </div>
                <div className="text-[22px] leading-tight font-bold text-white tabular-nums mt-1">{hasAny ? fmtEur(combinedSales) : "—"}</div>
                <div className="flex justify-between mt-1 text-[10px] text-zinc-500"><span>{hasAny ? `${totalRow?.refundsCount ?? 0} resi` : "—"}</span><span>{hasAny ? `${combinedUnits} unità` : "—"}</span></div>
              </div>
              <div className="px-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase tracking-[0.08em]"><span>Profitto netto</span><span className="rounded-full bg-bg-hover px-1.5 py-0.5 normal-case tracking-normal">—</span></div>
                <div className={`text-[16px] font-bold tabular-nums mt-1 ${combinedNetProfit < 0 ? "text-accent-red" : "text-accent-primary"}`}>{hasAny ? fmtEur(combinedNetProfit) : "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-bg-border/70 pt-2">
                <div className="rounded-md border border-bg-border/70 bg-bg-hover/30 px-2 py-1.5"><div className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">Costi</div><div className="text-[11px] font-semibold tabular-nums text-zinc-300">{totalRow ? fmtEur(totalRow.amazonFees + totalRow.cogs + (totalRow.adsSpend ?? 0)) : "—"}</div></div>
                <div className="rounded-md border border-bg-border/70 bg-bg-hover/30 px-2 py-1.5"><div className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">VAT</div><div className="text-[11px] font-semibold tabular-nums text-zinc-300">{totalRow ? fmtEur(totalRow.vatAmount ?? 0) : "—"}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-[11px]">
                <div>
                  <div className="text-zinc-500 text-[10px]">Unità</div>
                  <div className="text-zinc-300 tabular-nums">{hasAny ? combinedUnits : "—"}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px]">Resi</div>
                  <div className="text-zinc-300 tabular-nums">{totalRow ? totalRow.refundsCount : "—"}</div>
                </div>
                <div className="pt-2 border-t border-bg-border">
                  <div className="text-zinc-500 text-[10px]">Ads</div>
                  <div className="text-zinc-300 tabular-nums">{totalRow ? dash(totalRow.adsSpend, fmtEur) : "—"}</div>
                </div>
                <div className="pt-2 border-t border-bg-border">
                  <div className="text-zinc-500 text-[10px]">Payout stimato</div>
                  <div className="text-zinc-300 tabular-nums">{totalRow ? fmtEur(totalRow.estimatedPayout) : "—"}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px]">Fee Amazon</div>
                  <div className="text-zinc-300 tabular-nums">{totalRow ? fmtEur(totalRow.amazonFees) : "—"}</div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
