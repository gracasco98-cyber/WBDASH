// purchasing/purchase-order-state-machine.ts — pure module, no Prisma import.
// Whitelist of allowed logisticStatus transitions. The linear happy path plus
// a universal escape to CANCELLED from any pre-shipped state (FASE D), plus
// PARTIALLY_RECEIVED/RECEIVED reachable from any post-CONFIRMED state and
// RECEIVED reachable from PARTIALLY_RECEIVED (FASE E1 — see
// repositories/purchasing/goods-receipts.repo.ts, the only caller that
// triggers these two). COMPLETED remains unreachable until FASE E/G/M.
import type { PurchaseOrderLogisticStatus } from "@prisma/client";

const TRANSITIONS: Record<PurchaseOrderLogisticStatus, PurchaseOrderLogisticStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"],
  IN_PRODUCTION: ["READY", "CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"],
  READY: ["PARTIALLY_SHIPPED", "CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"],
  SHIPPED: ["CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedNextStatuses(from: PurchaseOrderLogisticStatus): PurchaseOrderLogisticStatus[] {
  return TRANSITIONS[from];
}

export function isValidTransition(from: PurchaseOrderLogisticStatus, to: PurchaseOrderLogisticStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
