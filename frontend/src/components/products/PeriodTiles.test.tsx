import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PeriodTiles from "./PeriodTiles";

const setPreset = vi.fn();
vi.mock("@/hooks/usePeriodFilter", () => ({
  usePeriodFilter: () => ({ state: { preset: "yesterday", from: "", to: "", compareMode: "none" }, setPreset, setDateRange: vi.fn(), setCompareMode: vi.fn(), reset: vi.fn() }),
}));

const mockGet = vi.fn(async (_params: unknown) => ({
  groups: [{
    product: { id: "p1", name: "X", brand: null },
    rows: [],
    aggregate: { identifierId: "i1", asin: "", marketplace: "ALL", sku: null, units: 5, sales: 100, promo: 0, refundsAmount: 0, refundsCount: 0, refundPct: 0, adsSpend: 5, realAcos: 0.05, amazonFees: 15, hasRealFees: true, cogs: 20, stock: 10, grossProfit: 60, netProfit: 60, estimatedPayout: 80, margin: 0.6, roi: 3, avgSellingPrice: 20, bsr: null },
  }],
}));
vi.mock("@/lib/api", () => ({ api: { productPerformance: { get: (params: unknown) => mockGet(params) } } }));

describe("PeriodTiles", () => {
  beforeEach(() => { mockGet.mockClear(); setPreset.mockClear(); });

  it("fetches 4 fixed presets independently of the active period", async () => {
    render(<PeriodTiles />);
    expect(await screen.findAllByText(/€/)).not.toHaveLength(0);
    expect(mockGet).toHaveBeenCalledTimes(4);
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
});
