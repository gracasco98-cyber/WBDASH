import { describe, it, expect } from "vitest";
import type { ProductPerformanceRow } from "@/lib/api";
import { reconcileWithLiveSummary } from "./periodTileReconcile";

const rows = (over: Partial<ProductPerformanceRow> = {}): ProductPerformanceRow => {
  const sales = 1100, refundsAmount = 0, amazonFees = 300, cogs = 200, adsSpend = 100, vatAmount = 100;
  const netProfit = sales - refundsAmount - vatAmount - amazonFees - cogs - adsSpend;
  return {
    identifierId: "", asin: "", marketplace: "ALL", sku: null, bsr: null,
    units: 100, sales, promo: 0, refundsAmount, refundsCount: 0, refundPct: 0,
    adsSpend, realAcos: null, amazonFees, hasRealFees: true, hasRealCogs: true,
    cogs, stock: 0, hasStockData: true,
    grossProfit: netProfit + adsSpend, netProfit,
    estimatedPayout: sales - refundsAmount - amazonFees - adsSpend,
    margin: netProfit / sales, roi: 0, avgSellingPrice: 11,
    vatAmount, vatEstimated: true, vatRate: null,
    ...over,
  } as ProductPerformanceRow;
};

/** Every displayed component must add up to the displayed margin. */
const reconciles = (r: ProductPerformanceRow) =>
  r.sales - r.refundsAmount - (r.vatAmount ?? 0) - r.amazonFees - r.cogs - (r.adsSpend ?? 0);

describe("reconcileWithLiveSummary", () => {
  it("returns the rows untouched when there is no live summary", () => {
    const base = rows();
    expect(reconcileWithLiveSummary(base, null)).toEqual(base);
  });

  it("carries extra live revenue into VAT, estimated fees, COGS and the margin", () => {
    const out = reconcileWithLiveSummary(rows(), { totalRevenue: 1320, unitsSold: 120, refunds: 0, refundCount: 0 });
    expect(out.sales).toBe(1320);
    expect(out.units).toBe(120);
    expect(out.vatAmount).toBeCloseTo(100 + 220 * 10 / 110, 6);
    expect(out.amazonFees).toBeCloseTo(300 + 220 * 0.15 + 20 * 3.8, 6);
    expect(out.cogs).toBeCloseTo(200 + 20 * 2, 6); // 2 €/unit average COGS of the rows
    expect(out.hasRealFees).toBe(false);
    expect(out.netProfit).toBeCloseTo(reconciles(out), 6);
    expect(out.estimatedPayout).toBeCloseTo(out.sales - out.refundsAmount - out.amazonFees - (out.adsSpend ?? 0), 6);
    expect(out.margin).toBeCloseTo(out.netProfit / out.sales, 6);
  });

  it("subtracts refunds that only the live summary knows about", () => {
    const out = reconcileWithLiveSummary(rows(), { totalRevenue: 1100, unitsSold: 100, refunds: 55, refundCount: 2 });
    expect(out.refundsAmount).toBe(55);
    expect(out.refundsCount).toBe(2);
    expect(out.vatAmount).toBeCloseTo(100 - 55 * 10 / 110, 6);
    expect(out.netProfit).toBeCloseTo(reconciles(out), 6);
  });

  it("keeps the components consistent when live revenue is lower than the rows", () => {
    const out = reconcileWithLiveSummary(rows(), { totalRevenue: 990, unitsSold: 90, refunds: 0, refundCount: 0 });
    expect(out.sales).toBe(990);
    expect(out.netProfit).toBeCloseTo(reconciles(out), 6);
  });
});
