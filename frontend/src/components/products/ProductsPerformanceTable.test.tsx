import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsPerformanceTable, { buildShopifyMarketplaceRows } from "./ProductsPerformanceTable";
import type { ProductPerformanceGroup, ProductPerformance } from "@/lib/api";

const mockCatalogImages = vi.fn(async (_asins: string[]) => ({}) as Record<string, string | null>);
const mockRename = vi.fn(async (_productId: string, _name: string) => undefined);
const mockMoveIdentifier = vi.fn(async (_identifierId: string, _targetProductId: string) => undefined);

vi.mock("@/lib/api", () => ({
  api: {
    amazon: { catalogImages: (asins: string[]) => mockCatalogImages(asins) },
    productPerformance: {
      rename: (productId: string, name: string) => mockRename(productId, name),
      moveIdentifier: (identifierId: string, targetProductId: string) => mockMoveIdentifier(identifierId, targetProductId),
    },
  },
}));

const baseRow = {
  identifierId: "ident-1", asin: "B0ABC123", marketplace: "IT", sku: "SKU-RSV-01",
  units: 10, sales: 200, promo: 5, refundsAmount: 2, refundsCount: 1, refundPct: 0.01,
  adsSpend: 8, realAcos: 0.04, amazonFees: 35, hasRealFees: true, hasRealCogs: true, cogs: 45, stock: 184, hasStockData: true,
  grossProfit: 110, netProfit: 110, estimatedPayout: 155, margin: 0.55, roi: 2.44,
  avgSellingPrice: 20, bsr: null,
};

const groups: ProductPerformanceGroup[] = [
  {
    product: { id: "p1", name: "Resveratrolo 500mg", brand: null },
    rows: [baseRow],
    aggregate: baseRow,
  },
];

describe("ProductsPerformanceTable", () => {
  beforeEach(() => {
    mockCatalogImages.mockClear();
    mockCatalogImages.mockResolvedValue({});
    mockRename.mockClear();
    mockRename.mockResolvedValue(undefined);
    mockMoveIdentifier.mockClear();
    mockMoveIdentifier.mockResolvedValue(undefined);
  });

  it("renders one parent row per product in 'product' groupBy mode", () => {
    render(<ProductsPerformanceTable groups={groups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    expect(screen.getByText("Resveratrolo 500mg")).toBeInTheDocument();
  });

  it("expands to show identifier rows on click", async () => {
    const user = userEvent.setup();
    render(<ProductsPerformanceTable groups={groups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    expect(screen.queryByText("B0ABC123")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /espandi resveratrolo 500mg/i }));
    expect(screen.getByText("B0ABC123")).toBeInTheDocument();
  });

  it("renders one parent row per marketplace in 'marketplace' groupBy mode", () => {
    render(<ProductsPerformanceTable groups={groups} groupBy="marketplace" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    expect(screen.getByText(/amazon\.it/i)).toBeInTheDocument();
  });

  it("calls onGroupByChange when the toggle changes", async () => {
    const user = userEvent.setup();
    const onGroupByChange = vi.fn();
    render(<ProductsPerformanceTable groups={groups} groupBy="marketplace" onGroupByChange={onGroupByChange} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/raggruppa per/i), "product");
    expect(onGroupByChange).toHaveBeenCalledWith("product");
  });

  it("shows '—' for null adsSpend/realAcos/bsr", () => {
    const rowWithNulls = { ...baseRow, adsSpend: null, realAcos: null, bsr: null };
    render(<ProductsPerformanceTable groups={[{ ...groups[0], rows: [rowWithNulls], aggregate: rowWithNulls }]} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3); // ads, acos, bsr
  });

  it("propagates the estimated-data badge to every cell derived from fee/COGS estimates", async () => {
    const estimatedRow = { ...baseRow, hasRealFees: false, hasRealCogs: false };
    const estimatedGroups: ProductPerformanceGroup[] = [
      {
        product: { id: "p1", name: "Resveratrolo 500mg", brand: null },
        rows: [estimatedRow],
        aggregate: estimatedRow,
      },
    ];
    const user = userEvent.setup();
    render(<ProductsPerformanceTable groups={estimatedGroups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    // Parent row: Fee Amazon + COGS, plus the 4 cells derived from them
    // (grossProfit, netProfit, margin, roi) = 6 badges.
    expect(screen.getAllByText("≈")).toHaveLength(6);
    expect(screen.getAllByTitle("Calcolato su fee/COGS parzialmente stimati")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: /espandi resveratrolo 500mg/i }));
    // The expanded child row adds its own 6, for 12 total.
    expect(screen.getAllByText("≈")).toHaveLength(12);
    expect(screen.getAllByTitle("Calcolato su fee/COGS parzialmente stimati")).toHaveLength(8);
  });

  it("badges derived cells when only fees are estimated (COGS real), and none when both are real", () => {
    const feesOnly = { ...baseRow, hasRealFees: false, hasRealCogs: true };
    const { rerender } = render(
      <ProductsPerformanceTable groups={[{ product: { id: "p1", name: "X", brand: null }, rows: [feesOnly], aggregate: feesOnly }]} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />
    );
    // Fee Amazon badge + the 4 derived badges — COGS itself stays unbadged.
    expect(screen.getAllByText("≈")).toHaveLength(5);

    rerender(
      <ProductsPerformanceTable groups={groups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />
    );
    expect(screen.queryAllByText("≈")).toHaveLength(0);
  });

  it("shows '—' for stock when the backend has no inventory data for the row", () => {
    const noStock = { ...baseRow, stock: 0, hasStockData: false, adsSpend: 8, realAcos: 0.04, bsr: 12 };
    render(<ProductsPerformanceTable groups={[{ product: { id: "p1", name: "X", brand: null }, rows: [noStock], aggregate: noStock }]} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    // Ads/ACOS/BSR are all populated here, so the only "—" is the stock cell.
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("renders a fetched thumbnail on the child row for a resolved ASIN", async () => {
    mockCatalogImages.mockResolvedValue({ B0ABC123: "https://example.com/img.jpg" });
    const user = userEvent.setup();
    const { container } = render(<ProductsPerformanceTable groups={groups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /espandi resveratrolo 500mg/i }));
    // The thumbnail is decorative (alt=""), so it has no accessible "img" role;
    // query the DOM node directly rather than by role.
    await vi.waitFor(() => expect(container.querySelector("img")).toBeInTheDocument());
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/img.jpg");
  });

  it("renders the product's own imageUrl on a Shopify/Redcare child row (no ASIN to look up in catalogImages)", async () => {
    // LOCK-IN: confirmed missing in production 2026-08-24 — Redcare rows have
    // asin: "" (EMPTY_COST_ROW), so images[child.metrics.asin] is always
    // undefined for them regardless of catalogImages(); the thumbnail must
    // fall back to the product's own imageUrl (already returned by the
    // backend) instead of staying permanently blank.
    const redcareProduct: ProductPerformance = {
      shopifyProductId: "gid://shopify/Product/1",
      productTitle: "Naturplan VENAVIL",
      sku: "VENAVIL",
      imageUrl: "https://cdn.shopify.com/venavil.jpg",
      marketplace: "REDCARE_IT",
      unitsSold: 4,
      grossRevenue: 45.22,
      refundedAmount: 0,
      netRevenue: 45.22,
      orderCount: 4,
      avgUnitPrice: 11.3,
      totalDiscount: 0,
    };
    const shopifyMarketplaceRows = buildShopifyMarketplaceRows([redcareProduct]);

    const user = userEvent.setup();
    const { container } = render(
      <ProductsPerformanceTable
        groups={[]}
        groupBy="marketplace"
        onGroupByChange={vi.fn()}
        onRenamed={vi.fn()}
        onMoved={vi.fn()}
        shopifyMarketplaceRows={shopifyMarketplaceRows}
      />
    );

    await user.click(screen.getByRole("button", { name: /espandi redcare it/i }));

    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.shopify.com/venavil.jpg");
    // catalogImages is Amazon-only (fetched from `groups`, empty here) — a
    // Redcare-only render must not call it with a bogus/empty ASIN list.
    expect(mockCatalogImages).not.toHaveBeenCalled();
  });

  it("shows an alert and does not crash when rename fails", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("New Name");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRename.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<ProductsPerformanceTable groups={groups} groupBy="product" onGroupByChange={vi.fn()} onRenamed={vi.fn()} onMoved={vi.fn()} />);
    await user.click(screen.getByTitle("Rinomina"));
    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Impossibile rinominare il prodotto. Riprova."));
    expect(screen.getByText("Resveratrolo 500mg")).toBeInTheDocument();
    promptSpy.mockRestore();
    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
