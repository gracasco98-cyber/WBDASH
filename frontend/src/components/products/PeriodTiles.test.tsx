import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateToIso, addDays } from "@/lib/periodUtils";
import PeriodTiles from "./PeriodTiles";

const setPreset = vi.fn();
vi.mock("@/hooks/usePeriodFilter", () => ({
  usePeriodFilter: () => ({ state: { preset: "yesterday", from: "", to: "", compareMode: "none" }, setPreset, setDateRange: vi.fn(), setCompareMode: vi.fn(), reset: vi.fn() }),
}));

const mockGet = vi.fn(async (_params: unknown) => ({
  groups: [{
    product: { id: "p1", name: "X", brand: null },
    rows: [],
    aggregate: { identifierId: "i1", asin: "", marketplace: "ALL", sku: null, units: 5, sales: 100, promo: 0, refundsAmount: 0, refundsCount: 0, refundPct: 0, adsSpend: 5, realAcos: 0.05, amazonFees: 15, hasRealFees: true, hasRealCogs: true, cogs: 20, stock: 10, grossProfit: 60, netProfit: 60, estimatedPayout: 80, margin: 0.6, roi: 3, avgSellingPrice: 20, bsr: null },
  }],
}));
vi.mock("@/lib/api", () => ({ api: { productPerformance: { get: (params: unknown) => mockGet(params) } } }));

describe("PeriodTiles", () => {
  beforeEach(() => { mockGet.mockClear(); setPreset.mockClear(); });

  it("fetches 5 fixed presets independently of the active period", async () => {
    render(<PeriodTiles />);
    expect(await screen.findAllByText(/€/)).not.toHaveLength(0);
    expect(mockGet).toHaveBeenCalledTimes(5);
  });

  it("clicking a tile sets the global period preset", async () => {
    const user = userEvent.setup();
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    await user.click(screen.getByRole("button", { name: /oggi/i }));
    expect(setPreset).toHaveBeenCalledWith("today");
  });

  it("highlights the tile matching the current global preset via its border style", async () => {
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    const yesterdayTile = screen.getByRole("button", { name: /ieri/i });
    const todayTile = screen.getByRole("button", { name: /oggi/i });
    expect(yesterdayTile).toHaveStyle({ border: "2px solid #111" });
    expect(todayTile).not.toHaveStyle({ border: "2px solid #111" });
  });

  it("handles fetch error gracefully without crashing, keeps tiles rendered with placeholder values", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet.mockRejectedValueOnce(new Error("API error"));
    render(<PeriodTiles />);
    // All 5 tile labels should still be rendered even if fetch fails
    expect(screen.getByRole("button", { name: /oggi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ieri/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /7 giorni/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /14 giorni/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /30 giorni/i })).toBeInTheDocument();
    // Verify component stays usable with "—" placeholder for all tiles
    expect(screen.getAllByText("—")).toHaveLength(5);
    // Verify error was logged
    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("[PeriodTiles] Failed to load period tiles:"), expect.any(Error)));
    consoleErrorSpy.mockRestore();
  });

  // Regression test mirroring frontend/src/app/prodotti/page.test.tsx's
  // timezone-fix pattern: presetDateRange used to build ISO dates via
  // `d.toISOString().slice(0, 10)`, which converts to UTC and can shift the
  // date by a day depending on the local timezone offset. It now uses
  // formatDateToIso (local getFullYear/getMonth/getDate), matching the
  // same date math as periodUtils.ts's getDateRangeForPreset.
  it("resolves the 'last30' tile's range using local-timezone date math, not UTC", async () => {
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);

    const expectedFrom = formatDateToIso(addDays(new Date(), -29));
    const expectedTo = formatDateToIso(new Date());

    await vi.waitFor(() => {
      const call = mockGet.mock.calls.find(
        ([p]: [any]) => p.from === expectedFrom && p.to === expectedTo
      );
      expect(call).toBeDefined();
    });
  });
});
