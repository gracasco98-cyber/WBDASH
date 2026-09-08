import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
const mockSuppliersList = vi.fn();
const mockOrdersList = vi.fn();
const mockCreate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/acquisti/fatture/nuovo",
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

vi.mock("@/lib/api", () => ({
  api: {
    suppliers: { list: () => mockSuppliersList() },
    purchaseOrders: { list: (filters?: unknown) => mockOrdersList(filters) },
    supplierInvoices: { create: (data: unknown) => mockCreate(data) },
    tasks: { list: () => mockTasksList() },
  },
}));

vi.mock("next/link", () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));

const mockTasksList = vi.fn();

import NuovaFatturaPage from "./page";

describe("NuovaFatturaPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSuppliersList.mockClear();
    mockOrdersList.mockClear();
    mockCreate.mockClear();
    mockTasksList.mockClear();
    mockSuppliersList.mockResolvedValue([{ id: "s1", legalName: "Acme Supply Srl" }]);
    mockOrdersList.mockResolvedValue([{ id: "po-1", poNumber: "PO-2026-000001" }]);
    mockCreate.mockResolvedValue({ id: "inv-1" });
    mockTasksList.mockResolvedValue({ tasks: [] });
  });

  it("loads suppliers and lets the user fill the form", async () => {
    render(<NuovaFatturaPage />);
    expect(await screen.findByText("Acme Supply Srl")).toBeInTheDocument();
  });

  it("auto-computes totalAmount from taxableAmount + vatAmount", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");
    await user.type(screen.getByLabelText(/numero fattura/i), "FT-001");
    await user.type(screen.getByLabelText(/imponibile/i), "100");
    await user.type(screen.getByLabelText(/^iva/i), "22");

    expect(screen.getByLabelText(/totale/i)).toHaveValue(122);
  });

  it("submits the form and redirects to the list on success", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");
    await user.type(screen.getByLabelText(/numero fattura/i), "FT-001");
    await user.type(screen.getByLabelText(/data fattura/i), "2026-08-10");
    await user.type(screen.getByLabelText(/imponibile/i), "100");
    await user.type(screen.getByLabelText(/^iva/i), "22");

    const form = screen.getByRole("button", { name: /salva/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        supplierId: "s1", invoiceNumber: "FT-001", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
      }));
    });
    expect(mockPush).toHaveBeenCalledWith("/acquisti/fatture");
  });

  it("loads the supplier's purchase orders when a supplier is selected", async () => {
    const user = userEvent.setup();
    render(<NuovaFatturaPage />);
    await screen.findByText("Acme Supply Srl");

    await user.selectOptions(screen.getByLabelText(/fornitore/i), "s1");

    expect(await screen.findByText("PO-2026-000001")).toBeInTheDocument();
    expect(mockOrdersList).toHaveBeenCalledWith({ supplierId: "s1" });
  });
});
