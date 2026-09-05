import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/acquisti/scadenzario"),
}));

vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => ({
    accounts: [{ id: "a1", name: "Account Test", sellerId: "S1", region: "EU" }],
    selectedAccountId: "a1", needsSelection: false, loading: false, selectAccount: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => ({ marketplace: "all", setMarketplace: vi.fn() }),
}));

vi.mock("@/hooks/useSSE", () => ({ useSSE: vi.fn() }));

const mockList = vi.fn();
const mockMarkPaid = vi.fn();
const mockTasksList = vi.fn(async () => ({ tasks: [] }));

vi.mock("@/lib/api", () => ({
  api: {
    paymentDues: {
      list: (filters?: unknown) => mockList(filters),
      markPaid: (id: string, paidDate: string, paidAmount: number) => mockMarkPaid(id, paidDate, paidAmount),
    },
    tasks: { list: () => mockTasksList() },
  },
}));

import ScadenzarioPage from "./page";
import { buildScadenzarioCsv } from "./csv";
import type { SupplierPaymentDue } from "@/lib/api/payment-dues";

function due(overrides: Partial<SupplierPaymentDue> = {}): SupplierPaymentDue {
  return {
    id: "d1", purchaseOrderId: "po1", installmentNumber: 1,
    dueDate: "2026-09-10T00:00:00Z", amount: 500, status: "PENDING",
    paidDate: null, paidAmount: null,
    purchaseOrder: { poNumber: "PO-001", supplier: { legalName: "Fornitore Alfa" } },
    ...overrides,
  };
}

describe("ScadenzarioPage", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockMarkPaid.mockReset();
    mockList.mockResolvedValue([due()]);
    mockMarkPaid.mockResolvedValue({});
  });

  it("filters rows by supplier name via the search box", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([
      due({ id: "d1", purchaseOrder: { poNumber: "PO-001", supplier: { legalName: "Fornitore Alfa" } } }),
      due({ id: "d2", purchaseOrder: { poNumber: "PO-002", supplier: { legalName: "Fornitore Beta" } } }),
    ]);
    render(<ScadenzarioPage />);
    await screen.findByText("Fornitore Alfa");
    expect(screen.getByText("Fornitore Beta")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/cerca ordine, fornitore/i), "Beta");

    expect(screen.queryByText("Fornitore Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("Fornitore Beta")).toBeInTheDocument();
  });

  it("filters rows by PO number via the search box", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([
      due({ id: "d1", purchaseOrder: { poNumber: "PO-001", supplier: { legalName: "Fornitore Alfa" } } }),
      due({ id: "d2", purchaseOrder: { poNumber: "PO-002", supplier: { legalName: "Fornitore Beta" } } }),
    ]);
    render(<ScadenzarioPage />);
    await screen.findByText("Fornitore Alfa");

    await user.type(screen.getByPlaceholderText(/cerca ordine, fornitore/i), "PO-002");

    expect(screen.queryByText("Fornitore Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("Fornitore Beta")).toBeInTheDocument();
  });

  it("opens a detail panel with the full row info when a row is clicked", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([due({ installmentNumber: 2, amount: 321.5 })]);
    render(<ScadenzarioPage />);
    await user.click(await screen.findByText("Fornitore Alfa"));

    expect(screen.getByText("Scheda scadenza")).toBeInTheDocument();
    expect(screen.getAllByText("PO-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("321,50 €").length).toBeGreaterThan(0);
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("marks a due as paid from the detail panel", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([due({ id: "d1", amount: 500 })]);
    render(<ScadenzarioPage />);
    await user.click(await screen.findByText("Fornitore Alfa"));

    // Both the table row and the panel expose their own "Segna come pagato"
    // button while the due is PENDING — the panel's is the last in DOM order.
    const buttons = screen.getAllByRole("button", { name: /segna come pagato/i });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(mockMarkPaid).toHaveBeenCalledWith("d1", expect.any(String), 500));
  });

  it("closes the detail panel after marking a due as paid", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([due({ id: "d1", amount: 500 })]);
    render(<ScadenzarioPage />);
    await user.click(await screen.findByText("Fornitore Alfa"));
    const buttons = screen.getAllByRole("button", { name: /segna come pagato/i });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(screen.queryByText("Scheda scadenza")).not.toBeInTheDocument());
  });
});

describe("buildScadenzarioCsv", () => {
  it("builds a CSV with a header row and one row per due date", () => {
    const csv = buildScadenzarioCsv([due({ dueDate: "2026-09-10T00:00:00Z", amount: 500 })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe('"Scadenza";"Ordine";"Fornitore";"Rata";"Importo";"Stato"');
    expect(lines[1]).toBe('"2026-09-10";"PO-001";"Fornitore Alfa";"1";"500.00";"Da pagare"');
  });

  it("escapes double quotes inside a field", () => {
    const csv = buildScadenzarioCsv([due({ purchaseOrder: { poNumber: "PO-001", supplier: { legalName: 'Fornitore "Alfa"' } } })]);
    expect(csv).toContain('"Fornitore ""Alfa"""');
  });
});
