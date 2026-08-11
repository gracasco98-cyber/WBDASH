// lib/api/purchase-orders.ts — PurchaseOrder + product picker.
import { apiUrl, get } from "./client";

export interface PickerProduct { id: string; name: string; brand: string | null; }

export type LogisticStatus =
  | "DRAFT" | "SENT" | "CONFIRMED" | "IN_PRODUCTION" | "READY" | "PARTIALLY_SHIPPED" | "SHIPPED"
  | "PARTIALLY_RECEIVED" | "RECEIVED" | "COMPLETED" | "CANCELLED";

export interface PurchaseOrderLine {
  id: string; productId: string; supplierSku: string | null; description: string;
  orderedQty: number; receivedQty: number; remainingQty: number; unitOfMeasure: string;
  unitPrice: number; discountPct: number | null; taxableAmount: number; vatAmount: number; totalAmount: number;
}

export interface PurchaseOrderStatusHistoryEntry {
  id: string; fromStatus: LogisticStatus; toStatus: LogisticStatus; changedById: string; changedAt: string; note: string | null;
}

export interface PurchaseOrder {
  id: string; poNumber: string; supplierId: string; orderDate: string; currency: string;
  logisticStatus: LogisticStatus; financialStatus: string; buyerId: string; warehouseId: string;
  expectedDeliveryDate: string | null; deliveryAddress: string | null; shippingMethod: string | null;
  incoterm: string | null; paymentTermId: string; internalNotes: string | null; supplierNotes: string | null;
  quoteReference: string | null;
  supplier?: { id: string; legalName: string };
  warehouse?: { id: string; name: string };
}

export type PurchaseOrderDetail = PurchaseOrder & {
  lines: PurchaseOrderLine[];
  statusHistory: PurchaseOrderStatusHistoryEntry[];
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface CreatePurchaseOrderLineInput {
  productId: string; supplierSku?: string; description: string; orderedQty: number;
  unitOfMeasure: string; unitPrice: number; discountPct?: number;
  taxableAmount: number; vatAmount: number; totalAmount: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string; orderDate: string; currency: string; warehouseId: string; paymentTermId: string;
  expectedDeliveryDate?: string; deliveryAddress?: string; shippingMethod?: string; incoterm?: string;
  internalNotes?: string; supplierNotes?: string; quoteReference?: string;
  lines: CreatePurchaseOrderLineInput[];
}

export const purchaseOrders = {
  list: (filters?: { logisticStatus?: string; supplierId?: string }) =>
    get<PurchaseOrder[]>("/api/purchasing/purchase-orders", filters as Record<string, string>),
  get: (id: string) => get<PurchaseOrderDetail>(`/api/purchasing/purchase-orders/${id}`),
  create: (data: CreatePurchaseOrderInput) => post<PurchaseOrder>("/api/purchasing/purchase-orders", data),
  transition: (id: string, toStatus: string, note?: string) =>
    post<PurchaseOrder>(`/api/purchasing/purchase-orders/${id}/transition`, { toStatus, note }),
  products: {
    listForPicker: () => get<PickerProduct[]>("/api/purchasing/products"),
  },
};
