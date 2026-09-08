import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/acquisti/fatture"),
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

const mockList = vi.fn(async (_filters?: unknown) => [] as SupplierInvoice[]);
const mockVoid = vi.fn(async (_id: string) => ({} as SupplierInvoice));
const mockTasksList = vi.fn(async () => ({ tasks: [] }));

vi.mock("@/lib/api", () => ({
  api: {
    supplierInvoices: {
      list: (filters?: unknown) => mockList(filters),
      void: (id: string) => mockVoid(id),
    },
    tasks: { list: () => mockTasksList() },
  },
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));

import FatturePage from "./page";
import type { SupplierInvoice } from "@/lib/api/supplier-invoices";

// Mock window.confirm
global.confirm = vi.fn(() => true);

const baseInvoice: SupplierInvoice = {
  id: "inv-1", invoiceNumber: "FT-001", supplierId: "s1", purchaseOrderId: "po-1",
  invoiceDate: "2026-08-10", receivedDate: "2026-08-10", taxableAmount: 100, vatAmount: 22, totalAmount: 122,
  currency: "EUR", source: "MANUAL", notes: null, voidedAt: null, createdById: "u1",
  createdAt: "2026-08-10", updatedAt: "2026-08-10",
  supplier: { id: "s1", legalName: "Acme Supply Srl" },
  purchaseOrder: { id: "po-1", poNumber: "PO-2026-000001" },
};

describe("FatturePage", () => {
  beforeEach(() => {
    mockList.mockClear();
    mockVoid.mockClear();
    mockList.mockResolvedValue([baseInvoice]);
    mockVoid.mockResolvedValue({ ...baseInvoice, voidedAt: "2026-08-11" });
  });

  it("renders one row per invoice with supplier, order and amount", async () => {
    render(<FatturePage />);
    expect(await screen.findByText("FT-001")).toBeInTheDocument();
    expect(screen.getByText("Acme Supply Srl")).toBeInTheDocument();
    expect(screen.getByText("PO-2026-000001")).toBeInTheDocument();
  });

  it("shows an empty state when there are no invoices", async () => {
    mockList.mockResolvedValue([]);
    render(<FatturePage />);
    expect(await screen.findByText(/nessuna fattura/i)).toBeInTheDocument();
  });

  it("voids an invoice and reloads the list", async () => {
    const user = userEvent.setup();
    render(<FatturePage />);
    await screen.findByText("FT-001");

    await user.click(screen.getByRole("button", { name: /annulla/i }));

    expect(mockVoid).toHaveBeenCalledWith("inv-1");
    expect(mockList).toHaveBeenCalledTimes(2); // initial load + reload after void
  });
});
