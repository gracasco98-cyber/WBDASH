// lib/api/payment-dues.ts — Scadenzario: supplier payment due dates.
import { apiUrl, get } from "./client";

export type PaymentDueStatus = "PENDING" | "PAID";

export interface SupplierPaymentDue {
  id: string;
  purchaseOrderId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: PaymentDueStatus;
  paidDate: string | null;
  paidAmount: number | null;
  purchaseOrder: { poNumber: string; supplier: { legalName: string } };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const paymentDues = {
  list: (filters?: { status?: PaymentDueStatus; supplierId?: string }) =>
    get<SupplierPaymentDue[]>("/api/purchasing/payment-dues", filters as Record<string, string>),
  markPaid: (id: string, paidDate: string, paidAmount: number) =>
    post<SupplierPaymentDue>(`/api/purchasing/payment-dues/${id}/mark-paid`, { paidDate, paidAmount }),
};
