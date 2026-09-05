import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── next/navigation ── AppHeader (useRouter) and GlobalSidebar (usePathname)
// both call into the App Router hooks, which aren't safe to render outside a
// real Next.js router context — mocked the same way as
// src/app/prodotti/page.test.tsx and src/app/amazon/page.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));

// ── useAmazonAccount ── consumed by AppHeader's AmazonAccountSelector.
// needsSelection: false + an account present lets it render immediately
// without throwing (the real hook throws outside an AmazonAccountProvider).
vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => ({
    accounts: [{ id: "a1", name: "Account Test", sellerId: "S1", region: "EU" }],
    selectedAccountId: "a1",
    needsSelection: false,
    loading: false,
    selectAccount: vi.fn(),
  }),
}));

// ── usePeriodFilter / useMarketplaceFilter ── the page itself, plus several
// children it renders (GlobalPeriodSelector, MarketplaceFilterSelector,
// PeriodTiles), all consume these hooks directly — mocked once here so every
// consumer shares the same values, following the pattern established in
// src/app/prodotti/page.test.tsx.
const mockUsePeriodFilter = vi.fn();
vi.mock("@/hooks/usePeriodFilter", () => ({
  usePeriodFilter: () => mockUsePeriodFilter(),
}));

const mockUseMarketplaceFilter = vi.fn();
vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => mockUseMarketplaceFilter(),
}));

// ── useSSE ── opens a real EventSource in the browser; jsdom doesn't
// implement EventSource at all, so the unmocked hook throws on mount. This
// page is the only one in the app that wires it up, so no existing test
// establishes a pattern for it — stub to a no-op.
vi.mock("@/hooks/useSSE", () => ({
  useSSE: () => {},
}));

const mockProductPerformanceGet = vi.fn(async (_params: unknown) => ({ groups: [] }));
vi.mock("@/lib/api", () => ({
  api: {
    summary: vi.fn(async () => ({ totalRevenue: 0, byMarketplace: {} })),
    timeseries: vi.fn(async () => []),
    orders: vi.fn(async () => ({ orders: [] })),
    syncStatus: vi.fn(async () => ({})),
    hourChannels: vi.fn(async () => []),
    amazon: {
      summary: vi.fn(async () => null),
      timeseries: vi.fn(async () => []),
      products: vi.fn(async () => ({ products: [] })),
      catalogImages: vi.fn(async () => ({})),
    },
    products: vi.fn(async () => ({ products: [] })),
    productPerformance: {
      get: (params: unknown) => mockProductPerformanceGet(params),
      rename: vi.fn(),
      moveIdentifier: vi.fn(),
    },
    mirakl: {
      stuckOrders: vi.fn(async () => ({ stuckOrders: [] })),
    },
    tasks: {
      list: vi.fn(async () => ({ tasks: [] })),
    },
  },
}));

import HomePage from "./page";

describe("HomePage — product BI section", () => {
  beforeEach(() => {
    mockProductPerformanceGet.mockClear();
    mockUsePeriodFilter.mockReturnValue({
      state: { preset: "last30" as const, from: "", to: "", compareMode: "none" as const },
      setPreset: vi.fn(),
      setDateRange: vi.fn(),
      setCompareMode: vi.fn(),
      reset: vi.fn(),
    });
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "all", setMarketplace: vi.fn() });
  });

  it("renders PeriodTiles and ProductsPerformanceTable instead of the old components", async () => {
    render(<HomePage />);

    // PeriodTiles preset buttons (BUSINESS INTELLIGENCE section, no product selected)
    expect(await screen.findByRole("button", { name: /oggi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ieri/i })).toBeInTheDocument();

    // ProductsPerformanceTable's groupBy control (PRODOTTI section) — renders
    // unconditionally regardless of which top-nav tab (Tiles/Chart/P&L/Trends)
    // is active, preserving the prior product-section behavior.
    expect(screen.getByLabelText(/raggruppa per/i)).toBeInTheDocument();
  });

  it("doesn't clip the period-selector dropdown with an overflow-hidden ancestor", async () => {
    // LOCK-IN: the filter-bar card wraps GlobalPeriodSelector's popover in an
    // `overflow-hidden` ancestor (added for the rounded-corner card look),
    // which visually clips the dropdown to nothing and makes it unclickable
    // once it extends past the card — confirmed live in production.
    const { container } = render(<HomePage />);
    await screen.findByRole("button", { name: /oggi/i });

    // Several "Oggi"-labeled buttons exist (PeriodTiles' own tiles included) —
    // GlobalPeriodSelector's is the one built around the Calendar icon.
    const calendarIcon = container.querySelector("svg.lucide-calendar");
    expect(calendarIcon).not.toBeNull();
    let el: HTMLElement | null = calendarIcon!.closest("button");
    expect(el).not.toBeNull();
    while (el && el !== container) {
      expect(el.className).not.toContain("overflow-hidden");
      el = el.parentElement;
    }
  });

  it("fetches product performance groups for the home page's own PRODOTTI section", async () => {
    render(<HomePage />);
    await screen.findByLabelText(/raggruppa per/i);

    await vi.waitFor(() => {
      expect(mockProductPerformanceGet).toHaveBeenCalledWith(
        expect.objectContaining({ marketplace: "all" })
      );
    });
  });

  it("translates an Amazon marketplace filter to its Amazon channel code", async () => {
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "AMAZON_IT", setMarketplace: vi.fn() });

    render(<HomePage />);
    await screen.findByLabelText(/raggruppa per/i);

    await vi.waitFor(() => {
      expect(mockProductPerformanceGet).toHaveBeenCalledWith(
        expect.objectContaining({ marketplace: "IT" })
      );
    });
  });
});
