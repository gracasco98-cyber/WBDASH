import { describe, it, expect, vi, afterEach } from "vitest";
import { getDateRangeForPreset, getPeriodLabel, formatDateToIso } from "./periodUtils";

describe("getDateRangeForPreset — month_to_date / last_month", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("returns the 1st of the current month through today for month_to_date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15)); // 15 September 2026
    const range = getDateRangeForPreset("month_to_date");
    expect(range).toEqual({ from: "2026-09-01", to: "2026-09-15" });
  });

  it("returns the full previous calendar month for last_month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15)); // 15 September 2026
    const range = getDateRangeForPreset("last_month");
    expect(range).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("rolls last_month back across a year boundary in January", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10)); // 10 January 2026
    const range = getDateRangeForPreset("last_month");
    expect(range).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("getPeriodLabel — month_to_date / last_month", () => {
  it("labels month_to_date and last_month in Italian", () => {
    expect(getPeriodLabel("month_to_date")).toBe("Mese in corso");
    expect(getPeriodLabel("last_month")).toBe("Mese scorso");
  });
});

// Sanity check the fake-timer dates above resolve the way the test intends.
describe("formatDateToIso sanity", () => {
  it("formats a local date without UTC shifting", () => {
    expect(formatDateToIso(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});
