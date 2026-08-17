// repositories/purchasing/purchase-orders.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, PurchaseOrder, PurchaseOrderLine, PurchaseOrderLogisticStatus } from "@prisma/client";
import { nextSequenceValue, formatPoNumber } from "./document-sequence.repo";
import { isValidTransition } from "../../purchasing/purchase-order-state-machine";

export type PurchaseOrderLineWithRemaining = PurchaseOrderLine & { remainingQty: number };

export type PurchaseOrderWithLines = PurchaseOrder & {
  lines: PurchaseOrderLineWithRemaining[];
  statusHistory: {
    id: string; fromStatus: PurchaseOrderLogisticStatus; toStatus: PurchaseOrderLogisticStatus;
    changedById: string; changedAt: Date; note: string | null;
  }[];
  supplier: { id: string; legalName: string };
  warehouse: { id: string; name: string };
};

function withRemaining(line: PurchaseOrderLine): PurchaseOrderLineWithRemaining {
  return { ...line, remainingQty: Number(line.orderedQty) - Number(line.receivedQty) };
}

export interface CreatePurchaseOrderLineInput {
  productId: string;
  supplierSku?: string | null;
  description: string;
  orderedQty: number;
  unitOfMeasure: string;
  unitPrice: number;
  discountPct?: number | null;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  orderDate: Date;
  currency: string;
  buyerId: string;
  warehouseId: string;
  expectedDeliveryDate?: Date | null;
  deliveryAddress?: string | null;
  shippingMethod?: string | null;
  incoterm?: string | null;
  paymentTermId: string;
  internalNotes?: string | null;
  supplierNotes?: string | null;
  quoteReference?: string | null;
  lines: CreatePurchaseOrderLineInput[];
}

export async function createPurchaseOrder(prisma: PrismaClient, data: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const year = data.orderDate.getFullYear();
  return prisma.$transaction(async (tx) => {
    const seq = await nextSequenceValue(tx, "PURCHASE_ORDER", year);
    return tx.purchaseOrder.create({
      data: {
        poNumber: formatPoNumber(year, seq),
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        currency: data.currency,
        buyerId: data.buyerId,
        warehouseId: data.warehouseId,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        shippingMethod: data.shippingMethod ?? null,
        incoterm: data.incoterm ?? null,
        paymentTermId: data.paymentTermId,
        internalNotes: data.internalNotes ?? null,
        supplierNotes: data.supplierNotes ?? null,
        quoteReference: data.quoteReference ?? null,
        lines: {
          create: data.lines.map((l) => ({
            productId: l.productId,
            supplierSku: l.supplierSku ?? null,
            description: l.description,
            orderedQty: l.orderedQty,
            unitOfMeasure: l.unitOfMeasure,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct ?? null,
            taxableAmount: l.taxableAmount,
            vatAmount: l.vatAmount,
            totalAmount: l.totalAmount,
          })),
        },
      },
    });
  });
}

export async function findAllPurchaseOrders(
  prisma: PrismaClient,
  filters?: { logisticStatus?: PurchaseOrderLogisticStatus; supplierId?: string }
): Promise<(PurchaseOrder & { supplier: { legalName: string }; warehouse: { name: string } })[]> {
  return prisma.purchaseOrder.findMany({
    where: { logisticStatus: filters?.logisticStatus, supplierId: filters?.supplierId },
    include: { supplier: { select: { legalName: true } }, warehouse: { select: { name: true } } },
    orderBy: { orderDate: "desc" },
  });
}

export async function findPurchaseOrderById(prisma: PrismaClient, id: string): Promise<PurchaseOrderWithLines | null> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: true,
      statusHistory: { orderBy: { changedAt: "desc" } },
      supplier: { select: { id: true, legalName: true } },
      warehouse: { select: { id: true, name: true } },
    },
  });
  if (!po) return null;
  return { ...po, lines: po.lines.map(withRemaining) };
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transizione non valida: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export async function transitionPurchaseOrderStatus(
  prisma: PrismaClient,
  id: string,
  toStatus: PurchaseOrderLogisticStatus,
  changedById: string,
  note?: string | null
): Promise<PurchaseOrder> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { logisticStatus: true } });
    if (!isValidTransition(current.logisticStatus, toStatus)) {
      throw new InvalidTransitionError(current.logisticStatus, toStatus);
    }
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId: id, fromStatus: current.logisticStatus, toStatus, changedById, note: note ?? null },
    });
    return tx.purchaseOrder.update({ where: { id }, data: { logisticStatus: toStatus } });
  });
}

/**
 * Permanently deletes a purchase order, regardless of status — including any
 * goods receipts (DDT) registered against it. Deliberate exception to this
 * project's usual soft-delete/append-only conventions, requested explicitly
 * by the user for cleaning up mistaken/test orders; real orders should
 * normally be cancelled (transitionPurchaseOrderStatus → CANCELLED), not
 * deleted, since that preserves history. GoodsReceipt rows are deleted first
 * (their GoodsReceiptLine rows cascade automatically) so the FK from
 * GoodsReceipt.purchaseOrderId — which is RESTRICT, not CASCADE — doesn't
 * block the purchaseOrder.delete() that follows. PurchaseOrderLine and
 * PurchaseOrderStatusHistory already cascade on PurchaseOrder deletion per
 * the schema, so no explicit cleanup needed for those two.
 */
export async function deletePurchaseOrder(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.goodsReceipt.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrder.delete({ where: { id } });
  });
}
