// lib/api/supplier-invoices.ts — Fatture Fornitore (FASE G): manual
// supplier-invoice registry, optionally linked to a purchase order.
import { apiUrl, get } from "./client";

export type SupplierInvoiceSource = "MANUAL" | "SDI";

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string | null;
  invoiceDate: string;
  receivedDate: string;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  source: SupplierInvoiceSource;
  notes: string | null;
  voidedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; legalName: string };
  purchaseOrder: { id: string; poNumber: string } | null;
}

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  purchaseOrderId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export const supplierInvoices = {
  list: (filters?: { supplierId?: string; purchaseOrderId?: string; includeVoided?: boolean }) =>
    get<SupplierInvoice[]>("/api/purchasing/supplier-invoices", {
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters?.purchaseOrderId ? { purchaseOrderId: filters.purchaseOrderId } : {}),
      ...(filters?.includeVoided ? { includeVoided: "true" } : {}),
    }),
  get: (id: string) => get<SupplierInvoice>(`/api/purchasing/supplier-invoices/${id}`),
  create: (data: CreateSupplierInvoiceInput) => post<SupplierInvoice>("/api/purchasing/supplier-invoices", data),
  void: (id: string) => post<SupplierInvoice>(`/api/purchasing/supplier-invoices/${id}/void`, {}),
};
