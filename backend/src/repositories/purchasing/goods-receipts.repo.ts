// repositories/purchasing/goods-receipts.repo.ts — GoodsReceipt is append-only:
// no update/delete functions exist here by design (see design doc §2). Creating
// a receipt, updating the order lines' receivedQty, and transitioning the
// order's logisticStatus all happen in one transaction so a partial write can
// never leave the order's aggregate receivedQty inconsistent with its status.
import type { PrismaClient, GoodsReceipt, GoodsReceiptLine, PurchaseOrderLogisticStatus } from "@prisma/client";
import { nextSequenceValue, formatGrnNumber } from "./document-sequence.repo";
import { isValidTransition } from "../../purchasing/purchase-order-state-machine";
import { InvalidTransitionError } from "./purchase-orders.repo";

const RECEIVABLE_STATUSES: PurchaseOrderLogisticStatus[] = [
  "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_RECEIVED",
];

export class OverReceiptError extends Error {
  constructor(purchaseOrderLineId: string, attempted: number, remaining: number) {
    super(`Line ${purchaseOrderLineId}: attempted to receive ${attempted}, only ${remaining} remaining`);
    this.name = "OverReceiptError";
  }
}

export class ForeignLineError extends Error {
  constructor(purchaseOrderLineId: string, purchaseOrderId: string) {
    super(`PurchaseOrderLine ${purchaseOrderLineId} does not belong to order ${purchaseOrderId}`);
    this.name = "ForeignLineError";
  }
}

export interface CreateGoodsReceiptLineInput {
  purchaseOrderLineId: string;
  receivedQty: number;
  notes?: string | null;
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  receiptDate: Date;
  supplierDdtNumber: string;
  supplierDdtDate: Date;
  carrier?: string | null;
  receivedById: string;
  notes?: string | null;
  lines: CreateGoodsReceiptLineInput[];
}

export type GoodsReceiptWithLines = GoodsReceipt & { lines: GoodsReceiptLine[] };

export async function createGoodsReceipt(
  prisma: PrismaClient,
  data: CreateGoodsReceiptInput
): Promise<GoodsReceiptWithLines> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: data.purchaseOrderId },
      include: { lines: true },
    });

    if (!RECEIVABLE_STATUSES.includes(order.logisticStatus)) {
      throw new InvalidTransitionError(order.logisticStatus, "PARTIALLY_RECEIVED/RECEIVED");
    }

    const linesById = new Map(order.lines.map((l) => [l.id, l]));

    // Aggregate requested quantities per purchaseOrderLineId BEFORE validating: a single
    // call can legitimately contain multiple rows for the same line (e.g. mixed-lot DDT),
    // and the overage check must compare their SUM against `remaining`, not each row in
    // isolation against a snapshot that never reflects the other rows in this same call.
    const requestedByLineId = new Map<string, number>();
    for (const input of data.lines) {
      const line = linesById.get(input.purchaseOrderLineId);
      if (!line) throw new ForeignLineError(input.purchaseOrderLineId, data.purchaseOrderId);
      requestedByLineId.set(
        input.purchaseOrderLineId,
        (requestedByLineId.get(input.purchaseOrderLineId) ?? 0) + input.receivedQty
      );
    }
    for (const [purchaseOrderLineId, totalRequested] of requestedByLineId) {
      const line = linesById.get(purchaseOrderLineId)!;
      const remaining = Number(line.orderedQty) - Number(line.receivedQty);
      if (totalRequested > remaining) {
        throw new OverReceiptError(purchaseOrderLineId, totalRequested, remaining);
      }
    }

    const year = data.receiptDate.getFullYear();
    const seq = await nextSequenceValue(tx, "GOODS_RECEIPT", year);

    const receipt = await tx.goodsReceipt.create({
      data: {
        grnNumber: formatGrnNumber(year, seq),
        purchaseOrderId: data.purchaseOrderId,
        receiptDate: data.receiptDate,
        supplierDdtNumber: data.supplierDdtNumber,
        supplierDdtDate: data.supplierDdtDate,
        carrier: data.carrier ?? null,
        receivedById: data.receivedById,
        notes: data.notes ?? null,
        lines: {
          create: data.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            receivedQty: l.receivedQty,
            notes: l.notes ?? null,
          })),
        },
      },
      include: { lines: true },
    });

    for (const input of data.lines) {
      // Atomic DB-side increment (not a JS-computed absolute SET): this is what makes it
      // safe for multiple rows in this same call to target the same line — each increment
      // compounds on top of the previous one instead of overwriting it — and it also
      // narrows the true-concurrency check-time race window described in the report.
      await tx.purchaseOrderLine.update({
        where: { id: input.purchaseOrderLineId },
        data: { receivedQty: { increment: input.receivedQty } },
      });
    }

    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: data.purchaseOrderId } });
    const allComplete = updatedLines.every((l) => Number(l.receivedQty) >= Number(l.orderedQty));
    const newStatus: PurchaseOrderLogisticStatus = allComplete ? "RECEIVED" : "PARTIALLY_RECEIVED";

    if (newStatus !== order.logisticStatus) {
      if (!isValidTransition(order.logisticStatus, newStatus)) {
        throw new InvalidTransitionError(order.logisticStatus, newStatus);
      }
      await tx.purchaseOrderStatusHistory.create({
        data: {
          purchaseOrderId: data.purchaseOrderId,
          fromStatus: order.logisticStatus,
          toStatus: newStatus,
          changedById: data.receivedById,
          note: `Ricezione DDT ${data.supplierDdtNumber}`,
        },
      });
      await tx.purchaseOrder.update({ where: { id: data.purchaseOrderId }, data: { logisticStatus: newStatus } });
    }

    return receipt;
  });
}

export async function findGoodsReceiptsByOrderId(
  prisma: PrismaClient,
  purchaseOrderId: string
): Promise<GoodsReceiptWithLines[]> {
  return prisma.goodsReceipt.findMany({
    where: { purchaseOrderId },
    include: { lines: true },
    orderBy: { receiptDate: "desc" },
  });
}
