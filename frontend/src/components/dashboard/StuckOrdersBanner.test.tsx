import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import StuckOrdersBanner from "./StuckOrdersBanner";
import type { StuckMiraklOrder } from "@/lib/api";

const mockStuckOrders = vi.fn(async () => ({ stuckOrders: [] as StuckMiraklOrder[] }));

vi.mock("@/lib/api", () => ({
  api: { mirakl: { stuckOrders: () => mockStuckOrders() } },
}));

describe("StuckOrdersBanner", () => {
  beforeEach(() => {
    mockStuckOrders.mockClear();
    mockStuckOrders.mockResolvedValue({ stuckOrders: [] });
  });

  it("renders nothing when there are no stuck orders", async () => {
    const { container } = render(<StuckOrdersBanner />);
    await vi.waitFor(() => expect(mockStuckOrders).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a warning with order details when orders are stuck", async () => {
    mockStuckOrders.mockResolvedValue({
      stuckOrders: [
        { orderId: "IT-1", orderState: "RECEIVED", createdDate: new Date().toISOString(), ageHours: 3.4, reason: "unsynced" },
      ],
    });
    render(<StuckOrdersBanner />);
    expect(await screen.findByText(/1 ordine redcare non è ancora arrivato su shopify/i)).toBeInTheDocument();
    expect(screen.getByText(/IT-1/)).toBeInTheDocument();
    expect(screen.getByText(/fermo da 3h/)).toBeInTheDocument();
  });

  it("pluralizes the headline for multiple stuck orders", async () => {
    mockStuckOrders.mockResolvedValue({
      stuckOrders: [
        { orderId: "IT-1", orderState: "RECEIVED", createdDate: new Date().toISOString(), ageHours: 3, reason: "unsynced" },
        { orderId: "IT-2", orderState: "WEIRD", createdDate: new Date().toISOString(), ageHours: 5, reason: "unrecognized" },
      ],
    });
    render(<StuckOrdersBanner />);
    expect(await screen.findByText(/2 ordini redcare non sono ancora arrivati su shopify/i)).toBeInTheDocument();
    expect(screen.getByText(/stato mirakl non riconosciuto/i)).toBeInTheDocument();
  });
});
