// repositories/purchasing/payment-terms.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, PaymentTerm, PaymentTermInstallmentRule, PurchasePaymentMethod } from "@prisma/client";

type PaymentTermWithInstallments = PaymentTerm & { installments: PaymentTermInstallmentRule[] };

export async function findAllPaymentTerms(prisma: PrismaClient) {
  return prisma.paymentTerm.findMany({
    include: {
      installments: { orderBy: { installmentNumber: "asc" } },
      _count: { select: { suppliers: true, purchaseOrders: true } },
    },
    orderBy: { name: "asc" },
  });
}

export interface CreatePaymentTermInput {
  name: string;
  type: string;
  endOfMonth: boolean;
  fixedDay?: number | null;
  paymentMethod: PurchasePaymentMethod;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export async function createPaymentTerm(
  prisma: PrismaClient,
  data: CreatePaymentTermInput
): Promise<PaymentTermWithInstallments> {
  const totalPct = data.installments.reduce((s, i) => s + i.percentage, 0);
  // Rounding tolerance: percentages are Decimal(5,2), so 0.01 covers legitimate
  // rounding (e.g. 33.34 + 33.33 + 33.33) without masking a real input error.
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100, got ${totalPct}`);
  }

  return prisma.paymentTerm.create({
    data: {
      name: data.name, type: data.type, endOfMonth: data.endOfMonth,
      fixedDay: data.fixedDay ?? null, paymentMethod: data.paymentMethod,
      installments: { create: data.installments },
    },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
}

export interface UpdatePaymentTermInput {
  name: string;
  type: string;
  endOfMonth: boolean;
  fixedDay?: number | null;
  paymentMethod: PurchasePaymentMethod;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export async function updatePaymentTerm(
  prisma: PrismaClient,
  id: string,
  data: UpdatePaymentTermInput
): Promise<PaymentTermWithInstallments> {
  const totalPct = data.installments.reduce((s, i) => s + i.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100, got ${totalPct}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.paymentTermInstallmentRule.deleteMany({ where: { paymentTermId: id } });
    return tx.paymentTerm.update({
      where: { id },
      data: {
        name: data.name, type: data.type, endOfMonth: data.endOfMonth,
        fixedDay: data.fixedDay ?? null, paymentMethod: data.paymentMethod,
        installments: { create: data.installments },
      },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
  });
}

export async function deactivatePaymentTerm(prisma: PrismaClient, id: string): Promise<PaymentTerm> {
  return prisma.paymentTerm.update({ where: { id }, data: { isActive: false } });
}
