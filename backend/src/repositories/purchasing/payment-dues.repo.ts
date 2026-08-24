// repositories/purchasing/payment-dues.repo.ts — SupplierPaymentDue rows are
// created exclusively by createGoodsReceipt() (goods-receipts.repo.ts) — this
// file only reads them and records a payment as made.
import type { PrismaClient, SupplierPaymentDue, SupplierPaymentDueStatus } from "@prisma/client";

export type SupplierPaymentDueWithOrder = SupplierPaymentDue & {
  purchaseOrder: { poNumber: string; supplier: { legalName: string } };
};

export async function findAllPaymentDues(
  prisma: PrismaClient,
  filters?: { status?: SupplierPaymentDueStatus; supplierId?: string }
): Promise<SupplierPaymentDueWithOrder[]> {
  return prisma.supplierPaymentDue.findMany({
    where: {
      status: filters?.status,
      purchaseOrder: filters?.supplierId ? { supplierId: filters.supplierId } : undefined,
    },
    include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { legalName: true } } } } },
    orderBy: { dueDate: "asc" },
  });
}

export async function markPaymentDuePaid(
  prisma: PrismaClient,
  id: string,
  paidDate: Date,
  paidAmount: number
): Promise<SupplierPaymentDue> {
  return prisma.supplierPaymentDue.update({
    where: { id },
    data: { status: "PAID", paidDate, paidAmount },
  });
}
