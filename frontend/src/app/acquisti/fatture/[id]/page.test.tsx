import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/acquisti/fatture/inv-1"),
  useParams: () => ({ id: "inv-1" }),
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

const mockGet = vi.fn(async (_id: string) => baseInvoice);
const mockVoid = vi.fn(async (_id: string) => ({ ...baseInvoice, voidedAt: "2026-08-11" }));
const mockTasksList = vi.fn(async () => ({ tasks: [] }));

vi.mock("@/lib/api", () => ({
  api: {
    supplierInvoices: { get: (id: string) => mockGet(id), void: (id: string) => mockVoid(id) },
    tasks: { list: () => mockTasksList() },
  },
}));

import FatturaDetailPage from "./page";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

const baseInvoice: SupplierInvoice = {
  id: "inv-1", invoiceNumber: "FT-001", supplierId: "s1", purchaseOrderId: "po-1",
  invoiceDate: "2026-08-10", receivedDate: "2026-08-10", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
  currency: "EUR", source: "MANUAL", notes: "Nota di test", voidedAt: null, createdById: "u1",
  createdAt: "2026-08-10", updatedAt: "2026-08-10",
  supplier: { id: "s1", legalName: "Acme Supply Srl" },
  purchaseOrder: { id: "po-1", poNumber: "PO-2026-000001" },
};

describe("FatturaDetailPage", () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockVoid.mockClear();
    mockTasksList.mockClear();
    mockGet.mockResolvedValue(baseInvoice);
    mockVoid.mockResolvedValue({ ...baseInvoice, voidedAt: "2026-08-11" });
    mockTasksList.mockResolvedValue({ tasks: [] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the invoice details", async () => {
    render(<FatturaDetailPage />);
    expect(await screen.findByText("FT-001")).toBeInTheDocument();
    expect(screen.getByText("Acme Supply Srl")).toBeInTheDocument();
    expect(screen.getByText("Nota di test")).toBeInTheDocument();
  });

  it("shows an 'Annulla fattura' action for an active invoice, hides it once voided", async () => {
    const user = userEvent.setup();
    render(<FatturaDetailPage />);
    await screen.findByText("FT-001");

    const button = screen.getByRole("button", { name: /annulla fattura/i });
    await user.click(button);

    expect(mockVoid).toHaveBeenCalledWith("inv-1");
    expect(await screen.findByText(/annullata/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /annulla fattura/i })).not.toBeInTheDocument();
  });
});
