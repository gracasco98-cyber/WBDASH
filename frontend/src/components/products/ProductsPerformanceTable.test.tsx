import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsPerformanceTable from "./ProductsPerformanceTable";
import type { ProductPerformanceGroup } from "@/lib/api";

const baseRow = {
  identifierId: "ident-1", asin: "B0ABC123", marketplace: "IT", sku: "SKU-RSV-01",
  units: 10, sales: 200, promo: 5, refundsAmount: 2, refundsCount: 1, refundPct: 0.01,
  adsSpend: 8, realAcos: 0.04, amazonFees: 35, hasRealFees: true, cogs: 45, stock: 184,
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
});
