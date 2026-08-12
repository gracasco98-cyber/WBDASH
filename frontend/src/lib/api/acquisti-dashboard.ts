// lib/api/acquisti-dashboard.ts — Acquisti/Amministrazione dashboard summary.
import { get } from "./client";
import type { LogisticStatus } from "./purchase-orders";

export interface StatusBreakdownEntry { status: LogisticStatus; count: number }
export interface OrdersOverTimePoint { date: string; count: number }
export interface TopSupplierEntry { supplierId: string; legalName: string; orderCount: number; totalValue: number }
export interface RecentOrderEntry {
  id: string; poNumber: string; supplierName: string; orderDate: string;
  logisticStatus: LogisticStatus; totalValue: number;
}

export interface DashboardSummary {
  ordersInProgress: number;
  valueInProgress: number;
  activeSuppliers: number;
  statusBreakdown: StatusBreakdownEntry[];
  ordersOverTime: OrdersOverTimePoint[];
  topSuppliers: TopSupplierEntry[];
  recentOrders: RecentOrderEntry[];
}

export const acquistiDashboard = {
  get: () => get<DashboardSummary>("/api/purchasing/dashboard"),
};
