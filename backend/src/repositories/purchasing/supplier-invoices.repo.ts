// repositories/purchasing/supplier-invoices.repo.ts — FASE G: manual supplier
// invoice registry. Optionally linked to one PurchaseOrder, whose
// financialStatus this file keeps in sync (OPEN/PARTIALLY_INVOICED/INVOICED
// only — PARTIALLY_PAID/PAID belong to FASE M and are never touched here).
import type { PrismaClient, SupplierInvoice, SupplierInvoiceSource, PurchaseOrderFinancialStatus } from "@prisma/client";

export type SupplierInvoiceWithRelations = SupplierInvoice & {
  supplier: { id: string; legalName: string };
  purchaseOrder: { id: string; poNumber: string } | null;
};

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  purchaseOrderId?: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  receivedDate?: Date;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  currency?: string;
  source?: SupplierInvoiceSource;
  notes?: string | null;
}

const FASE_G_STATUSES: PurchaseOrderFinancialStatus[] = ["OPEN", "PARTIALLY_INVOICED", "INVOICED"];

/** Recomputes and writes financialStatus for one purchase order, comparing
 *  its lines' total against its non-voided invoices' total. No-op if the
 *  order's current status is outside FASE G scope (PARTIALLY_PAID/PAID —
 *  FASE M territory, never overwritten by this phase). */
async function syncPurchaseOrderFinancialStatus(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  purchaseOrderId: string
): Promise<void> {
  const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, select: { financialStatus: true } });
  if (!FASE_G_STATUSES.includes(order.financialStatus)) return;

  const [linesAgg, invoicesAgg] = await Promise.all([
    tx.purchaseOrderLine.aggregate({ _sum: { totalAmount: true }, where: { purchaseOrderId } }),
    tx.supplierInvoice.aggregate({ _sum: { totalAmount: true }, where: { purchaseOrderId, voidedAt: null } }),
  ]);
  const orderTotal = Number(linesAgg._sum.totalAmount ?? 0);
  const invoicedTotal = Number(invoicesAgg._sum.totalAmount ?? 0);

  const next: PurchaseOrderFinancialStatus =
    invoicedTotal <= 0 ? "OPEN" : invoicedTotal >= orderTotal ? "INVOICED" : "PARTIALLY_INVOICED";

  if (next !== order.financialStatus) {
    await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { financialStatus: next } });
  }
}

export async function createSupplierInvoice(
  prisma: PrismaClient,
  input: CreateSupplierInvoiceInput,
  createdById: string
): Promise<SupplierInvoiceWithRelations> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.supplierInvoice.create({
      data: {
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        receivedDate: input.receivedDate ?? new Date(),
        taxableAmount: input.taxableAmount,
        vatAmount: input.vatAmount,
        totalAmount: input.totalAmount,
        currency: input.currency ?? "EUR",
        source: input.source ?? "MANUAL",
        notes: input.notes ?? null,
        createdById,
      },
      include: {
        supplier: { select: { id: true, legalName: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    });
    if (invoice.purchaseOrderId) {
      await syncPurchaseOrderFinancialStatus(tx, invoice.purchaseOrderId);
    }
    return invoice;
  });
}

export async function voidSupplierInvoice(prisma: PrismaClient, id: string): Promise<SupplierInvoiceWithRelations> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (current.voidedAt) {
      return tx.supplierInvoice.findUniqueOrThrow({
        where: { id },
        include: { supplier: { select: { id: true, legalName: true } }, purchaseOrder: { select: { id: true, poNumber: true } } },
      });
    }
    const voided = await tx.supplierInvoice.update({
      where: { id },
      data: { voidedAt: new Date() },
      include: { supplier: { select: { id: true, legalName: true } }, purchaseOrder: { select: { id: true, poNumber: true } } },
    });
    if (voided.purchaseOrderId) {
      await syncPurchaseOrderFinancialStatus(tx, voided.purchaseOrderId);
    }
    return voided;
  });
}

export async function findAllSupplierInvoices(
  prisma: PrismaClient,
  filters?: { supplierId?: string; purchaseOrderId?: string; includeVoided?: boolean }
): Promise<SupplierInvoiceWithRelations[]> {
  return prisma.supplierInvoice.findMany({
    where: {
      supplierId: filters?.supplierId,
      purchaseOrderId: filters?.purchaseOrderId,
      voidedAt: filters?.includeVoided ? undefined : null,
    },
    include: {
      supplier: { select: { id: true, legalName: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
}

export async function findSupplierInvoiceById(prisma: PrismaClient, id: string): Promise<SupplierInvoiceWithRelations> {
  return prisma.supplierInvoice.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: { select: { id: true, legalName: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
    },
  });
}
