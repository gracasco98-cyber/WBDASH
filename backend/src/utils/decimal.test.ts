import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toNum, convertDecimalsDeep } from "./decimal";

describe("toNum", () => {
  it("converts a Prisma.Decimal to an exact JS number", () => {
    const d = new Prisma.Decimal("123.4500");
    expect(toNum(d)).toBe(123.45);
  });

  it("passes through a plain number unchanged", () => {
    expect(toNum(42)).toBe(42);
  });

  it("returns null for null", () => {
    expect(toNum(null)).toBeNull();
  });

  it("returns undefined for undefined", () => {
    expect(toNum(undefined)).toBeUndefined();
  });

  it("does not lose precision the way naive Decimal addition would", () => {
    // Decimal + Decimal via JS `+` coerces to strings and concatenates —
    // this is exactly the silent bug toNum exists to prevent.
    const a = new Prisma.Decimal("0.1");
    const b = new Prisma.Decimal("0.2");
    const wrong = (a as unknown as number) + (b as unknown as number);
    expect(wrong).toBe("0.10.2"); // documents the bug we must never reintroduce
    expect(toNum(a) + toNum(b)).toBeCloseTo(0.3);
  });
});

describe("convertDecimalsDeep", () => {
  it("converts a top-level Decimal field on a plain row object", () => {
    const row = { asin: "B001", spend: new Prisma.Decimal("12.50") };
    expect(convertDecimalsDeep(row)).toEqual({ asin: "B001", spend: 12.5 });
  });

  it("converts Decimal fields inside an array of rows (typical $queryRaw result)", () => {
    const rows = [
      { grossRevenue: new Prisma.Decimal("100.00") },
      { grossRevenue: new Prisma.Decimal("200.50") },
    ];
    expect(convertDecimalsDeep(rows)).toEqual([{ grossRevenue: 100 }, { grossRevenue: 200.5 }]);
  });

  it("leaves non-Decimal values (Date, string, number, null, boolean) untouched", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const row = { date, name: "x", count: 5, note: null, active: true };
    expect(convertDecimalsDeep(row)).toEqual(row);
    expect(convertDecimalsDeep(row).date).toBe(date); // same Date instance, not stringified
  });

  it("recurses into nested objects", () => {
    const row = { outer: { inner: new Prisma.Decimal("5.5") } };
    expect(convertDecimalsDeep(row)).toEqual({ outer: { inner: 5.5 } });
  });
});
