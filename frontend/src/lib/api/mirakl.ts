// lib/api/mirakl.ts — Mirakl (Redcare) sync reconciliation status.
import { get } from "./client";

export interface StuckMiraklOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  ageHours: number;
  reason: "unsynced" | "unrecognized";
}

export interface StuckMiraklOrdersResponse {
  stuckOrders: StuckMiraklOrder[];
}

export const mirakl = {
  stuckOrders: () => get<StuckMiraklOrdersResponse>("/api/mirakl/stuck-orders"),
};
