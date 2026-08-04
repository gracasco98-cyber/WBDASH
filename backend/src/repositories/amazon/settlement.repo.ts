// settlement.repo.ts — Repository layer for AmazonSettlement + AmazonSettlementTransaction.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
// Every operation is scoped to the current Amazon account (context/account-context.ts).
import type { PrismaClient, AmazonSettlementTransaction, Prisma } from "@prisma/client";
import { toNum } from "../../utils/decimal";
import { getCurrentAccountId } from "../../context/account-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpsertSettlementParams {
  settlementId: string;
  marketplace: string;
  totalAmount: number;
  startDate: Date;
  endDate: Date;
  depositDate?: Date;
  currency: string;
}

// ─── AmazonSettlement operations ──────────────────────────────────────────────

/**
 * Upsert an AmazonSettlement header record, scoped to the current account.
 * NOTE: totalAmount is stored from the header row — NOT computed from transactions.
 * This preserves the documented quirk that totalAmount != sum(transactions).
 */
export async function upsertAmazonSettlement(
  prisma: PrismaClient,
  params: UpsertSettlementParams
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await (prisma as any).amazonSettlement.upsert({
    where:  { amazonAccountId_settlementId: { amazonAccountId, settlementId: params.settlementId } },
    update: {
      marketplace:  params.marketplace,
      totalAmount:  params.totalAmount,
      startDate:    params.startDate,
      endDate:      params.endDate,
      depositDate:  params.depositDate ?? undefined,
      currency:     params.currency,
      updatedAt:    new Date(),
    },
    create: {
      amazonAccountId,
      settlementId: params.settlementId,
      marketplace:  params.marketplace,
      totalAmount:  params.totalAmount,
      startDate:    params.startDate,
      endDate:      params.endDate,
      depositDate:  params.depositDate ?? undefined,
      currency:     params.currency,
    },
  });
}

/**
 * Find the first settlement (current account only) whose endDate falls within a ±7-day window of a given date.
 * Used for forecast reconciliation.
 */
export async function findSettlementNearDate(
  prisma: PrismaClient,
  params: { marketplace: string; nearDate: Date; windowDays?: number }
): Promise<{ settlementId: string; totalAmount: number | null; endDate: Date; depositDate: Date | null } | null> {
  const windowMs = (params.windowDays ?? 7) * 86400000;
  const nearMs = params.nearDate.getTime();
  const row = await (prisma as any).amazonSettlement.findFirst({
    where: {
      amazonAccountId: getCurrentAccountId(),
      marketplace: params.marketplace,
      endDate: {
        gte: new Date(nearMs - windowMs),
        lte: new Date(nearMs + windowMs),
      },
      totalAmount: { not: undefined },
    },
    orderBy: { depositDate: "desc" },
  });
  if (!row) return null;
  return { ...row, totalAmount: toNum(row.totalAmount) };
}

// ─── AmazonSettlementTransaction operations ────────────────────────────────────

/**
 * Delete all transactions for a settlement, current account only (idempotent re-sync).
 */
export async function deleteSettlementTransactions(
  prisma: PrismaClient,
  settlementId: string
): Promise<void> {
  await prisma.amazonSettlementTransaction.deleteMany({
    where: { settlementId, amazonAccountId: getCurrentAccountId() },
  });
}

/**
 * Batch-insert settlement transactions (skipDuplicates = true) for the current account.
 * Returns the count of inserted rows.
 */
export async function createSettlementTransactions(
  prisma: PrismaClient,
  data: Omit<Prisma.AmazonSettlementTransactionCreateManyInput, "amazonAccountId">[]
): Promise<number> {
  const amazonAccountId = getCurrentAccountId();
  const res = await prisma.amazonSettlementTransaction.createMany({
    data: data.map((d) => ({ ...d, amazonAccountId })),
    skipDuplicates: true,
  });
  return res.count;
}

/**
 * Find all transactions for the given order IDs, within the current account.
 * Used to compute per-order fee breakdown (commission, FBA, refunds, other).
 */
export async function findTransactionsForOrders(
  prisma: PrismaClient,
  orderIds: string[]
): Promise<
  (Pick<AmazonSettlementTransaction, "orderId" | "amountType" | "transactionType"> & { amount: number })[]
> {
  if (orderIds.length === 0) return [];
  const rows = await prisma.amazonSettlementTransaction.findMany({
    where: { orderId: { in: orderIds }, amazonAccountId: getCurrentAccountId() },
    select: { orderId: true, amountType: true, amount: true, transactionType: true },
  });
  return rows.map((r) => ({ ...r, amount: toNum(r.amount) }));
}

/**
 * Find settlement transactions for the given ASINs within a date range,
 * current account only. Used to resolve real fees/refunds per product
 * (product-performance.repo.ts) — same underlying table as
 * findTransactionsForOrders, but keyed by asin instead of orderId.
 */
export async function findTransactionsForAsins(
  prisma: PrismaClient,
  params: { asins: string[]; marketplace?: string; dateFrom: Date; dateTo: Date }
): Promise<Array<{ asin: string | null; marketplace: string; amountType: string; amount: number }>> {
  if (params.asins.length === 0) return [];
  const rows = await prisma.amazonSettlementTransaction.findMany({
    where: {
      amazonAccountId: getCurrentAccountId(),
      asin: { in: params.asins },
      postedDate: { gte: params.dateFrom, lte: params.dateTo },
      ...(params.marketplace && params.marketplace !== "all" ? { marketplace: params.marketplace } : {}),
    },
    select: { asin: true, marketplace: true, amountType: true, amount: true },
  });
  return rows.map((r) => ({ ...r, amount: toNum(r.amount) }));
}

/**
 * Count all AmazonSettlementTransaction rows for the current account via raw SQL.
 * Returns 0 if the table doesn't exist yet.
 */
export async function countSettlementTransactions(prisma: PrismaClient): Promise<number> {
  const r = await prisma.$queryRaw<[{ count: string }]>`
    SELECT COUNT(*) FROM "AmazonSettlementTransaction" WHERE "amazonAccountId" = ${getCurrentAccountId()}
  `;
  return Number(r[0]?.count ?? 0);
}
