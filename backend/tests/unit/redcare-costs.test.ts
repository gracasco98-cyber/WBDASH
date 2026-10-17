import { describe, it, expect } from "vitest";
import { extractVat, calculateRedcareKpis } from "../../src/config/redcare-costs";

describe("extractVat", () => {
  it("extracts VAT from a VAT-inclusive amount instead of adding the rate on top", () => {
    expect(extractVat(110, 10)).toBeCloseTo(10, 6);
    expect(extractVat(122, 22)).toBeCloseTo(22, 6);
  });

  it("never returns negative VAT", () => {
    expect(extractVat(-50, 10)).toBe(0);
  });
});

describe("calculateRedcareKpis", () => {
  it("net margin is turnover minus refunds, fees, shipping, Ads, sales VAT and COGS", () => {
    const kpis = calculateRedcareKpis({
      gross: 440, refunds: 0, net: 440, adSpend: 20, orderCount: 2, cogs: 100,
    });
    expect(kpis.redcareVat).toBeCloseTo(40, 6); // 440 × 10/110
    expect(kpis.redcareFee).toBeCloseTo(66, 6); // 15% of 440
    expect(kpis.redcareShippingCost).toBeCloseTo(8.72, 6);
    expect(kpis.redcareCogs).toBe(100);
    expect(kpis.totalNet).toBeCloseTo(440 - 66 - 8.72 - 20 - 40 - 100, 6);
  });

  it("refunds reduce the taxable and fee base", () => {
    const kpis = calculateRedcareKpis({
      gross: 330, refunds: 110, net: 220, adSpend: 0, orderCount: 0, cogs: 0,
    });
    expect(kpis.redcareVat).toBeCloseTo(20, 6);
    expect(kpis.redcareFee).toBeCloseTo(33, 6);
  });
});
