import { describe, expect, it } from "vitest";
import { buildSalesAndTrafficQuery, parseDataKioskJsonLines } from "./data-kiosk.service";

describe("Data Kiosk sales and traffic", () => {
  it("builds a daily CHILD-ASIN query for the selected marketplace", () => {
    const query = buildSalesAndTrafficQuery({ asin: "B0GVKYHXZK", marketplace: "IT", from: "2026-11-01", to: "2026-11-15" });
    expect(query).toContain("analytics_salesAndTraffic_2024_04_24");
    expect(query).toContain("dateAggregation: DAY");
    expect(query).toContain("asinAggregation: CHILD");
    expect(query).toContain('marketplaceId: "APJ6JRA9NG5V4"');
    expect(query).toContain('asins: ["B0GVKYHXZK"]');
    expect(query).not.toContain("orderItemSessionPercentage");
  });

  it("rejects malformed ASINs before creating a paid Data Kiosk query", () => {
    expect(() => buildSalesAndTrafficQuery({ asin: "B0D8V3N45", marketplace: "IT", from: "2026-11-01", to: "2026-11-15" })).toThrow("ASIN non valido");
  });

  it("extracts daily traffic rows from JSONL envelopes", () => {
    const jsonl = [
      JSON.stringify({ data: { analytics_salesAndTraffic_2024_04_24: { salesAndTrafficTrends: [{ childAsin: "B0D8V3N45", startDate: "2026-11-14", traffic: { sessions: 121, pageViews: 157, unitSessionPercentage: 9.92 } }] } } }),
      JSON.stringify({ data: { analytics_salesAndTraffic_2024_04_24: { salesAndTrafficTrends: [{ childAsin: "B0D8V3N45", startDate: "2026-11-15", traffic: { sessions: 98, pageViews: 130 } }] } } }),
    ].join("\n");
    expect(parseDataKioskJsonLines(jsonl)).toEqual([
      { date: "2026-11-14", asin: "B0D8V3N45", sessions: 121, pageViews: 157, unitSessionPercentage: 9.92 },
      { date: "2026-11-15", asin: "B0D8V3N45", sessions: 98, pageViews: 130, unitSessionPercentage: null },
    ]);
  });
});
