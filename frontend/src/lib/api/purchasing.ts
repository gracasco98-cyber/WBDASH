// lib/api/purchasing.ts — Warehouse, PaymentTerm, BankAccount master data.
import { apiUrl, get } from "./client";

export interface Warehouse {
  id: string; name: string; code: string; address: string | null; isActive: boolean;
  _count: { purchaseOrders: number };
}

export interface PaymentTermInstallmentRule {
  id: string; installmentNumber: number; offsetDays: number; percentage: number;
}

export interface PaymentTerm {
  id: string; name: string; type: string; endOfMonth: boolean; fixedDay: number | null;
  paymentMethod: string; isActive: boolean; installments: PaymentTermInstallmentRule[];
  _count: { suppliers: number; purchaseOrders: number };
}

export interface PaymentTermInput {
  name: string; type: string; endOfMonth: boolean; fixedDay?: number;
  paymentMethod: string;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export interface BankAccount {
  id: string; bankName: string; alias: string; accountHolder: string; iban: string;
  bic: string | null; currency: string; openingBalance: number; openingBalanceDate: string;
  isActive: boolean; accountingCode: string | null; notes: string | null;
}

export interface CreateBankAccountInput {
  bankName: string; alias: string; accountHolder: string; iban: string; bic?: string;
  currency?: string; openingBalance: number; openingBalanceDate: string;
  accountingCode?: string; notes?: string;
}

export interface UpdateBankAccountInput {
  bankName: string; alias: string; accountHolder: string; bic?: string; accountingCode?: string; notes?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PUT", credentials: "include",
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
    update: (id: string, data: { name: string; address?: string }) => put<Warehouse>(`/api/purchasing/warehouses/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/warehouses/${id}`),
  },
  paymentTerms: {
    list: () => get<PaymentTerm[]>("/api/purchasing/payment-terms"),
    create: (data: PaymentTermInput) => post<PaymentTerm>("/api/purchasing/payment-terms", data),
    update: (id: string, data: PaymentTermInput) => put<PaymentTerm>(`/api/purchasing/payment-terms/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/payment-terms/${id}`),
  },
  bankAccounts: {
    list: () => get<BankAccount[]>("/api/purchasing/bank-accounts"),
    create: (data: CreateBankAccountInput) => post<BankAccount>("/api/purchasing/bank-accounts", data),
    update: (id: string, data: UpdateBankAccountInput) => put<BankAccount>(`/api/purchasing/bank-accounts/${id}`, data),
    deactivate: (id: string) => del(`/api/purchasing/bank-accounts/${id}`),
  },
};
