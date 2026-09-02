import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateToIso, addDays } from "@/lib/periodUtils";
import PeriodTiles, { sumAggregate } from "./PeriodTiles";
import type { ProductPerformanceRow } from "@/lib/api";

const setPreset = vi.fn();
vi.mock("@/hooks/usePeriodFilter", () => ({
  usePeriodFilter: () => ({ state: { preset: "yesterday", from: "", to: "", compareMode: "none" }, setPreset, setDateRange: vi.fn(), setCompareMode: vi.fn(), reset: vi.fn() }),
}));

let mockMarketplace = "all";
vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => ({ marketplace: mockMarketplace, setMarketplace: vi.fn() }),
}));

let mockSelectedAccountId: string | null = null;
vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => ({ selectedAccountId: mockSelectedAccountId }),
}));

const mockGet = vi.fn(async (_params: unknown) => ({
  groups: [{
    product: { id: "p1", name: "X", brand: null },
    rows: [],
    aggregate: { identifierId: "i1", asin: "", marketplace: "ALL", sku: null, units: 5, sales: 100, promo: 0, refundsAmount: 0, refundsCount: 0, refundPct: 0, adsSpend: 5, realAcos: 0.05, amazonFees: 15, hasRealFees: true, hasRealCogs: true, cogs: 20, stock: 10, hasStockData: true, grossProfit: 60, netProfit: 60, estimatedPayout: 80, margin: 0.6, roi: 3, avgSellingPrice: 20, bsr: null },
  }],
}));
const mockProducts = vi.fn(async (_params: unknown) => ({
  products: [{ grossRevenue: 40, unitsSold: 2 }],
  kpis: { totalGross: 40, totalNet: 35 },
}));
vi.mock("@/lib/api", () => ({
  api: {
    productPerformance: { get: (params: unknown) => mockGet(params) },
    products: (params: unknown) => mockProducts(params),
  },
}));

describe("PeriodTiles", () => {
  beforeEach(() => { mockGet.mockClear(); mockProducts.mockClear(); setPreset.mockClear(); mockMarketplace = "all"; mockSelectedAccountId = null; });

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

  it("highlights the tile matching the current global preset via its border class", async () => {
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    const yesterdayTile = screen.getByRole("button", { name: /ieri/i });
    const todayTile = screen.getByRole("button", { name: /oggi/i });
    expect(yesterdayTile).toHaveClass("border-accent-primary");
    expect(todayTile).not.toHaveClass("border-accent-primary");
  });

  it("scopes every tile fetch to the globally selected Amazon marketplace", async () => {
    mockMarketplace = "AMAZON_DE";
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    expect(mockGet).toHaveBeenCalledTimes(5);
    for (const [params] of mockGet.mock.calls as [any][]) {
      expect(params.marketplace).toBe("DE");
    }
  });

  it("requests amazonAccountId=ALL when no account is explicitly selected (dashboard default)", async () => {
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    for (const [params] of mockGet.mock.calls as [any][]) {
      expect(params.amazonAccountId).toBe("ALL");
    }
  });

  it("requests only the selected account's id once one is chosen from the switcher", async () => {
    mockSelectedAccountId = "acc-123";
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    for (const [params] of mockGet.mock.calls as [any][]) {
      expect(params.amazonAccountId).toBe("acc-123");
    }
  });

  it("includes Shopify/Redcare net revenue in the net profit card", async () => {
    render(<PeriodTiles />);
    await vi.waitFor(() => expect(screen.getAllByText("€ 95,00")).toHaveLength(5));
  });

  it("falls back to 'all' when the global filter is a Shopify channel, not an Amazon one", async () => {
    mockMarketplace = "SHOPIFY_CH";
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    for (const [params] of mockGet.mock.calls as [any][]) {
      expect(params.marketplace).toBe("all");
    }
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
    // Verify component stays usable with placeholders when one channel fails.
    expect(screen.getAllByText("—")).toHaveLength(65);
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
  // Root-cause regression for the "profit tiles show data on the wrong day"
  // report: the Amazon fetch (mockGet) resolves "today"/"yesterday"/etc. in
  // the BROWSER's local clock via presetDateRange(), then sends explicit
  // from/to dates. The Shopify/Redcare fetch (mockProducts) used to send only
  // `filter: preset` and let the SERVER resolve "today" independently at
  // request time — two separate clocks for the nominally same day, which can
  // disagree right around a day boundary (or if the browser's system
  // timezone differs from the server's Italy-offset assumption). Both calls
  // must be pinned to the exact same from/to for a given preset.
  it("sends the same explicit from/to to both the Amazon and Shopify/Redcare fetches for every preset", async () => {
    render(<PeriodTiles />);
    await screen.findAllByText(/€/);
    await vi.waitFor(() => expect(mockProducts).toHaveBeenCalledTimes(5));

    for (const [params] of mockProducts.mock.calls as [any][]) {
      expect(params.from).toBeTruthy();
      expect(params.to).toBeTruthy();
    }
    // Every from/to pair the Shopify fetch used must appear, unchanged, among
    // the Amazon fetch's from/to pairs — proving both sides share one clock.
    const amazonPairs = new Set(
      (mockGet.mock.calls as [any][]).map(([p]) => `${p.from}|${p.to}`)
    );
    for (const [params] of mockProducts.mock.calls as [any][]) {
      expect(amazonPairs.has(`${params.from}|${params.to}`)).toBe(true);
    }
  });

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

describe("sumAggregate", () => {
  const row = (overrides: Partial<ProductPerformanceRow>): ProductPerformanceRow => ({
    identifierId: "i", asin: "A", marketplace: "IT", sku: null, units: 1, sales: 10, promo: 0,
    refundsAmount: 0, refundsCount: 0, refundPct: 0, adsSpend: null, realAcos: null, amazonFees: 1,
    hasRealFees: true, hasRealCogs: true, cogs: 2, stock: 3, hasStockData: true,
    grossProfit: 7, netProfit: 7, estimatedPayout: 9, margin: 0.7, roi: 3.5, avgSellingPrice: 10, bsr: null,
    ...overrides,
  });

  it("claims verified data only when EVERY contributing row is verified (AND-logic)", () => {
    // The old OR-logic let a single verified row make the whole total look
    // verified — the exact inversion of the safeguard these flags exist for.
    const mixed = sumAggregate([row({}), row({ hasRealFees: false, hasRealCogs: false, hasStockData: false })])!;
    expect(mixed.hasRealFees).toBe(false);
    expect(mixed.hasRealCogs).toBe(false);
    expect(mixed.hasStockData).toBe(false);
  });

  it("claims verified data when all rows are verified, and still sums the numbers", () => {
    const allReal = sumAggregate([row({}), row({ sales: 30, units: 2 })])!;
    expect(allReal.hasRealFees).toBe(true);
    expect(allReal.hasRealCogs).toBe(true);
    expect(allReal.hasStockData).toBe(true);
    expect(allReal.sales).toBe(40);
    expect(allReal.units).toBe(3);
  });

  it("returns null for an empty row set", () => {
    expect(sumAggregate([])).toBeNull();
  });
});
