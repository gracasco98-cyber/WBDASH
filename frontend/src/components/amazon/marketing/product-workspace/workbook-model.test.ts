import { describe, expect, it } from "vitest";
import { automaticCell, createDefaultWorkbook, WORKBOOK_COLUMNS } from "./workbook-model";

describe("launch workbook model", () => {
  it("preserves the supplied Excel A:AP structure", () => {
    expect(WORKBOOK_COLUMNS).toHaveLength(42);
    expect(WORKBOOK_COLUMNS[0]).toMatchObject({ key: "A", label: "DATA" });
    expect(WORKBOOK_COLUMNS.at(-1)).toMatchObject({ key: "AP", label: "VALORE DI RIENTRO" });
  });

  it("maps ASIN sales, PPC and Data Kiosk values into automatic cells", () => {
    const row = createDefaultWorkbook(1).rows[0];
    const metrics = new Map([[row.date, { date: row.date, sales: 179, units: 12, ppcSales: 72, ppcUnits: 5, ppcSpend: 31.4, impressions: 2000, clicks: 80 }]]);
    const traffic = new Map([[row.date, { date: row.date, asin: "B0D8V3N45", sessions: 120, pageViews: 155, unitSessionPercentage: 10 }]]);
    expect(automaticCell("I", row, metrics, traffic)).toBe(12);
    expect(automaticCell("N", row, metrics, traffic)).toBe(5);
    expect(automaticCell("AC", row, metrics, traffic)).toBe(120);
    expect(automaticCell("AF", row, metrics, traffic)).toBe(10);
  });
});
