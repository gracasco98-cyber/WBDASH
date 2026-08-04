import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsPerformanceTable from "./ProductsPerformanceTable";
import type { ProductPerformanceGroup } from "@/lib/api";

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
  adsSpend: 8, realAcos: 0.04, amazonFees: 35, hasRealFees: true, hasRealCogs: true, cogs: 45, stock: 184,
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

  it("shows an estimated-data badge on Fee Amazon and COGS when hasRealFees/hasRealCogs are false", async () => {
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
    // Parent row: Fee Amazon + COGS badges (2)
    expect(screen.getAllByText("≈")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /espandi resveratrolo 500mg/i }));
    // Expanded child row adds its own Fee Amazon + COGS badges (2 more, 4 total)
    expect(screen.getAllByText("≈")).toHaveLength(4);
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
