import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatDateToIso, addDays } from "@/lib/periodUtils";

// ── next/navigation ── AppHeader (useRouter) and GlobalSidebar (usePathname)
// both call into the App Router hooks, which aren't safe to render outside a
// real Next.js router context — mocked the same way as GlobalSidebar.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/prodotti"),
}));

// ── useAmazonAccount ── consumed both by the page's own AmazonAccountGuard
// and by AppHeader's AmazonAccountSelector. needsSelection: false + an
// account present lets guarded content render immediately.
const mockUseAmazonAccount = vi.fn(() => ({
  accounts: [{ id: "a1", name: "Account Test", sellerId: "S1", region: "EU" }],
  selectedAccountId: "a1",
  needsSelection: false,
  loading: false,
  selectAccount: vi.fn(),
}));
vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => mockUseAmazonAccount(),
}));

// ── usePeriodFilter ── the real PeriodContext leaves `from`/`to` empty for
// every preset except "custom" (see PeriodContext.setPreset) — mirror that
// here so the test exercises the same preset->date resolution the real page
// has to perform, rather than a shape that never occurs in production.
// "last30" is used (rather than "yesterday"/"today"/"last7"/"last14") because
// those four overlap with PeriodTiles' own fixed tiles, which fire their own
// independent productPerformance.get calls with the same from/to — using a
// preset outside that set keeps this page's own load() call unambiguous.
const mockUsePeriodFilter = vi.fn();
vi.mock("@/hooks/usePeriodFilter", () => ({
  usePeriodFilter: () => mockUsePeriodFilter(),
}));

const mockUseMarketplaceFilter = vi.fn();
vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => mockUseMarketplaceFilter(),
}));

const mockGet = vi.fn(async (_params: unknown) => ({ groups: [] }));
vi.mock("@/lib/api", () => ({
  api: {
    productPerformance: {
      get: (params: unknown) => mockGet(params),
      rename: vi.fn(),
      moveIdentifier: vi.fn(),
    },
  },
}));

import ProdottiPage from "./page";

describe("ProdottiPage", () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockUseAmazonAccount.mockReturnValue({
      accounts: [{ id: "a1", name: "Account Test", sellerId: "S1", region: "EU" }],
      selectedAccountId: "a1",
      needsSelection: false,
      loading: false,
      selectAccount: vi.fn(),
    });
    mockUsePeriodFilter.mockReturnValue({
      state: { preset: "last30" as const, from: "", to: "", compareMode: "none" as const },
      setPreset: vi.fn(),
      setDateRange: vi.fn(),
      setCompareMode: vi.fn(),
      reset: vi.fn(),
    });
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "all", setMarketplace: vi.fn() });
  });

  it("renders the page heading, the period tiles and the products table", async () => {
    render(<ProdottiPage />);
    expect(await screen.findByRole("heading", { name: "Prodotti" })).toBeInTheDocument();
    // PeriodTiles preset buttons
    expect(screen.getByRole("button", { name: /ieri/i })).toBeInTheDocument();
    // ProductsPerformanceTable's groupBy control
    expect(screen.getByLabelText(/raggruppa per/i)).toBeInTheDocument();
  });

  it("resolves the 'last30' preset's empty from/to into a concrete 30-day range, not today's date alone", async () => {
    render(<ProdottiPage />);
    await screen.findByRole("heading", { name: "Prodotti" });

    const expectedFrom = formatDateToIso(addDays(new Date(), -29));
    const expectedTo = formatDateToIso(new Date());

    // PeriodTiles fires its own 4 fixed-preset calls independently (all with
    // marketplace "all" too) — match on the from/to pair unique to "last30"
    // to isolate this page's own load() call from those.
    await vi.waitFor(() => {
      const call = mockGet.mock.calls.find(
        ([p]: [any]) => p.marketplace === "all" && p.from === expectedFrom && p.to === expectedTo
      );
      expect(call).toBeDefined();
    });
  });

  it("translates a global Amazon channel filter (e.g. AMAZON_IT) into the raw marketplace code the endpoint expects", async () => {
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "AMAZON_IT", setMarketplace: vi.fn() });

    render(<ProdottiPage />);
    await screen.findByRole("heading", { name: "Prodotti" });

    await vi.waitFor(() => {
      const call = mockGet.mock.calls.find(([p]: [any]) => p.marketplace === "IT");
      expect(call).toBeDefined();
    });
  });
});
