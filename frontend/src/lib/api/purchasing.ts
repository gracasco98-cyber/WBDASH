// lib/api/purchasing.ts — Warehouse, PaymentTerm, BankAccount master data.
import { apiUrl, get } from "./client";

export interface Warehouse {
  id: string; name: string; code: string; address: string | null; isActive: boolean;
}

export interface PaymentTermInstallmentRule {
  id: string; installmentNumber: number; offsetDays: number; percentage: number;
}

export interface PaymentTerm {
  id: string; name: string; type: string; endOfMonth: boolean; fixedDay: number | null;
  paymentMethod: string; isActive: boolean; installments: PaymentTermInstallmentRule[];
}

export interface BankAccount {
  id: string; bankName: string; alias: string; accountHolder: string; iban: string;
  bic: string | null; currency: string; openingBalance: number; openingBalanceDate: string;
  isActive: boolean; accountingCode: string | null; notes: string | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const purchasing = {
  warehouses: {
    list: () => get<Warehouse[]>("/api/purchasing/warehouses"),
    create: (data: { name: string; code: string; address?: string }) => post<Warehouse>("/api/purchasing/warehouses", data),
    deactivate: (id: string) => del(`/api/purchasing/warehouses/${id}`),
  },
  paymentTerms: {
    list: () => get<PaymentTerm[]>("/api/purchasing/payment-terms"),
    create: (data: { name: string; type: string; endOfMonth: boolean; fixedDay?: number; paymentMethod: string; installments: { installmentNumber: number; offsetDays: number; percentage: number }[] }) =>
      post<PaymentTerm>("/api/purchasing/payment-terms", data),
    deactivate: (id: string) => del(`/api/purchasing/payment-terms/${id}`),
  },
  bankAccounts: {
    list: () => get<BankAccount[]>("/api/purchasing/bank-accounts"),
    create: (data: { bankName: string; alias: string; accountHolder: string; iban: string; bic?: string; currency?: string; openingBalance: number; openingBalanceDate: string; accountingCode?: string; notes?: string }) =>
      post<BankAccount>("/api/purchasing/bank-accounts", data),
    deactivate: (id: string) => del(`/api/purchasing/bank-accounts/${id}`),
  },
};
