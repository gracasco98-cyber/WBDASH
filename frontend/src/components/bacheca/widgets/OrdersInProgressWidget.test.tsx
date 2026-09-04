import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OrdersInProgressWidget from "./OrdersInProgressWidget";

const mockGet = vi.fn();
vi.mock("@/lib/api", () => ({ api: { acquistiDashboard: { get: () => mockGet() } } }));

describe("OrdersInProgressWidget", () => {
  it("shows the count of orders in progress", async () => {
    mockGet.mockResolvedValue({ ordersInProgress: 7, valueInProgress: 0, activeSuppliers: 0, statusBreakdown: [], topSuppliers: [], ordersOverTime: [], recentOrders: [] });
    render(<OrdersInProgressWidget />);
    expect(await screen.findByText("7")).toBeInTheDocument();
  });
});
