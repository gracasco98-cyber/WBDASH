import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RevenueTodayWidget from "./RevenueTodayWidget";

const mockGet = vi.fn();
vi.mock("@/lib/api", () => ({ api: { productPerformance: { get: (p: unknown) => mockGet(p) } } }));

describe("RevenueTodayWidget", () => {
  it("sums sales across every product group for today", async () => {
    mockGet.mockResolvedValue({
      groups: [
        { product: { id: "p1", name: "A", brand: null }, rows: [], aggregate: { sales: 100 } },
        { product: { id: "p2", name: "B", brand: null }, rows: [], aggregate: { sales: 50 } },
      ],
    });
    render(<RevenueTodayWidget />);
    expect(await screen.findByText(/150,00/)).toBeInTheDocument();
  });

  it("shows zero when there are no product groups today", async () => {
    mockGet.mockResolvedValue({ groups: [] });
    render(<RevenueTodayWidget />);
    expect(await screen.findByText(/0,00/)).toBeInTheDocument();
  });
});
