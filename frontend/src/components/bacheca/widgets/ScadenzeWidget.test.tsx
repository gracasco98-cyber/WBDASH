import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ScadenzeWidget from "./ScadenzeWidget";

const mockList = vi.fn();
vi.mock("@/lib/api", () => ({ api: { paymentDues: { list: (f: unknown) => mockList(f) } } }));

function due(id: string, dueDate: string, supplier: string, amount: number) {
  return { id, purchaseOrderId: "po1", installmentNumber: 1, dueDate, amount, status: "PENDING", paidDate: null, paidAmount: null, purchaseOrder: { poNumber: "PO-1", supplier: { legalName: supplier } } };
}

describe("ScadenzeWidget", () => {
  it("shows the 3 soonest pending payment dues, sorted by date", async () => {
    mockList.mockResolvedValue([
      due("d1", "2026-09-20", "Fornitore C", 300),
      due("d2", "2026-09-05", "Fornitore A", 100),
      due("d3", "2026-09-10", "Fornitore B", 200),
      due("d4", "2026-09-25", "Fornitore D", 400),
    ]);
    render(<ScadenzeWidget />);
    expect(mockList).toHaveBeenCalledWith({ status: "PENDING" });
    await screen.findByText("Fornitore A");
    const rendered = screen.getAllByText(/Fornitore/).map(el => el.textContent);
    expect(rendered).toEqual(["Fornitore A", "Fornitore B", "Fornitore C"]);
  });

  it("shows an empty state when there are no pending dues", async () => {
    mockList.mockResolvedValue([]);
    render(<ScadenzeWidget />);
    expect(await screen.findByText(/nessuna scadenza/i)).toBeInTheDocument();
  });
});
