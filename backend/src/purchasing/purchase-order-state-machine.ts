// purchasing/purchase-order-state-machine.ts — pure module, no Prisma import.
// Whitelist of allowed logisticStatus transitions. Only the linear happy path
// plus a universal escape to CANCELLED from any pre-COMPLETED state is
// reachable in FASE D — PARTIALLY_RECEIVED/RECEIVED/COMPLETED become reachable
// when FASE E (goods receipts) extends this table.
import type { PurchaseOrderLogisticStatus } from "@prisma/client";

const TRANSITIONS: Record<PurchaseOrderLogisticStatus, PurchaseOrderLogisticStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["PARTIALLY_SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["CANCELLED"],
  PARTIALLY_RECEIVED: [],
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
