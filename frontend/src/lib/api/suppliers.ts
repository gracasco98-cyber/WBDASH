// lib/api/suppliers.ts — Supplier, SupplierContact, SupplierProduct.
import { apiUrl, get } from "./client";

export interface Supplier {
  id: string; legalName: string; tradeName: string | null; internalCode: string;
  isActive: boolean; supplierType: string; country: string; language: string | null;
  defaultCurrency: string; vatNumber: string | null; taxCode: string | null;
  foreignVatNumber: string | null; sdiCode: string | null; pec: string | null;
  taxRegime: string | null; fiscalNotes: string | null; addressLine: string | null;
  streetNumber: string | null; postalCode: string | null; city: string | null;
  province: string | null; addressCountry: string | null;
  defaultPaymentMethod: string | null; defaultPaymentTermId: string | null;
  paymentDays: number | null; bankName: string | null; iban: string | null;
  bic: string | null; ribaEnabled: boolean; fixedPaymentDays: number[];
  defaultPaymentTerm: { name: string } | null;
  _count: { products: number };
}

export interface SupplierContact {
  id: string; supplierId: string; name: string; role: string | null; email: string | null;
  phone: string | null; whatsapp: string | null; isPrimary: boolean; notes: string | null;
}

export interface SupplierProductPriceHistory {
  id: string; price: number; currency: string; validFrom: string; source: string; note: string | null;
}

export interface SupplierProduct {
  id: string; supplierId: string; productId: string; supplierSku: string | null;
  supplierProductName: string | null; standardPrice: number; currency: string;
  moq: number | null; orderMultiple: number | null; leadTimeDays: number | null;
  unitsPerCarton: number | null; unitsPerPallet: number | null; weightKg: number | null;
  conditions: string | null; lastPriceDate: string; isPreferredSupplier: boolean;
  notes: string | null; priceHistory: SupplierProductPriceHistory[];
  product?: { id: string; name: string };
}

export type SupplierDetail = Supplier & { contacts: SupplierContact[]; products: SupplierProduct[] };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function del(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const suppliers = {
  list: () => get<Supplier[]>("/api/purchasing/suppliers"),
  get: (id: string) => get<SupplierDetail>(`/api/purchasing/suppliers/${id}`),
  create: (data: Record<string, unknown>) => post<Supplier>("/api/purchasing/suppliers", data),
  update: (id: string, data: Record<string, unknown>) => put<Supplier>(`/api/purchasing/suppliers/${id}`, data),
  deactivate: (id: string) => del(`/api/purchasing/suppliers/${id}`),
  contacts: {
    create: (supplierId: string, data: Record<string, unknown>) => post<SupplierContact>(`/api/purchasing/suppliers/${supplierId}/contacts`, data),
    update: (supplierId: string, contactId: string, data: Record<string, unknown>) => put<SupplierContact>(`/api/purchasing/suppliers/${supplierId}/contacts/${contactId}`, data),
    remove: (supplierId: string, contactId: string) => del(`/api/purchasing/suppliers/${supplierId}/contacts/${contactId}`),
  },
  products: {
    add: (supplierId: string, data: Record<string, unknown>) => post<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products`, data),
    updatePrice: (supplierId: string, spId: string, data: { price: number; currency?: string; source: string; note?: string }) =>
      put<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products/${spId}/price`, data),
    updateDetails: (supplierId: string, spId: string, data: Record<string, unknown>) => put<SupplierProduct>(`/api/purchasing/suppliers/${supplierId}/products/${spId}`, data),
    remove: (supplierId: string, spId: string) => del(`/api/purchasing/suppliers/${supplierId}/products/${spId}`),
  },
};
