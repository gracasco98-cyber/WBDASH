import { describe, it, expect } from "vitest";
import { buildIncassoExplain, buildMarginExplain, type TileFigures } from "./periodTileExplain";

const figures: TileFigures = {
  amazon: { sales: 8688, units: 760, refunds: 40, refundsCount: 3, vat: 786.18, fees: 4235.22, feesEstimated: true, cogs: 1650, ads: 1990 },
  other: { sales: 450.48, units: 48, refunds: 6.59, refundCount: 1, vat: 40.36, fee: 67.58, shipping: 117.72, cogs: 110, ads: 38.39 },
  netProfit: 0, // filled below
};
const sum = (f: TileFigures) => {
  const a = f.amazon!, o = f.other!;
  return a.sales + o.sales - a.refunds - o.refunds - a.vat - o.vat - a.fees - o.fee - o.shipping - a.cogs - o.cogs - a.ads - o.ads;
};

describe("buildMarginExplain", () => {
  it("lists every item and ends with the margin, adding up to the cent", () => {
    const f = { ...figures, netProfit: sum(figures) };
    const e = buildMarginExplain(f);
    expect(e.lines.map((l) => l.label)).toEqual([
      "Incasso", "Advertising", "Fee Amazon", "Fee Redcare", "Spedizioni Redcare", "Merce (COGS)", "Resi", "IVA",
    ]);
    const total = e.lines.reduce((s, l) => s + l.amount, 0);
    expect(total).toBeCloseTo(e.total.amount, 6);
    expect(e.total.amount).toBeCloseTo(f.netProfit, 6);
    expect(e.lines.find((l) => l.label === "Fee Amazon")?.estimated).toBe(true);
    expect(e.lines.find((l) => l.label === "Spedizioni Redcare")?.note).toContain("27 ordini");
  });

  it("shows an explicit adjustment line when the items do not add up to the margin", () => {
    const f = { ...figures, netProfit: sum(figures) + 48.01 };
    const e = buildMarginExplain(f);
    const adj = e.lines.find((l) => l.label === "Altre rettifiche");
    expect(adj?.amount).toBeCloseTo(48.01, 6);
    expect(e.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(f.netProfit, 6);
  });

  it("omits Redcare items when only Amazon is in scope", () => {
    const f: TileFigures = { amazon: figures.amazon, netProfit: 100 };
    const labels = buildMarginExplain(f).lines.map((l) => l.label);
    expect(labels).not.toContain("Fee Redcare");
    expect(labels).not.toContain("Spedizioni Redcare");
  });
});

describe("buildIncassoExplain", () => {
  it("splits turnover by channel and shows the VAT it contains", () => {
    const e = buildIncassoExplain({ ...figures, netProfit: 0 });
    expect(e.total.amount).toBeCloseTo(9138.48, 2);
    expect(e.lines.map((l) => l.label)).toEqual(["Amazon", "Redcare / Shopify", "di cui IVA", "Resi"]);
    expect(e.lines[0].note).toContain("760 unità");
    expect(e.lines[2].amount).toBeCloseTo(826.54, 2);
    expect(e.lines[3].note).toContain("4 resi");
  });
});
