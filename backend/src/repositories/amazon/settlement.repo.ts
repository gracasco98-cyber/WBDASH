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

// ─── Historical fee ratios (per-marketplace aggregate) ────────────────────────

export interface HistoricalFeeRatios {
  marketplace: string;
  grossSales: number;
  realPayout: number;
  payoutRatio: number;
  rCommission: number;
  rFba: number;
  rAds: number;
  rAdsVat: number;
  rDsf: number;
  rStorage: number;
  rInbound: number;
  rPrep: number;
  rRefunds: number;
  rOther: number;
  rReimb: number;
  avgStoragePerSett: number;
  avgInboundPerSett: number;
  nSett: number;
}

/**
 * Per-marketplace historical fee ratios (fee/gross) computed from real settled
 * data, verified against real bank transfers. One row per marketplace, summed
 * across every settlement ever recorded for that marketplace.
 *
 * Shared by /payments/dashboard and /payments/forecast — previously two
 * near-identical raw-SQL blocks (docs/tech-debt.md E.1) that differed only in
 * where the sign negation was applied (inside vs. outside the CTE) and which
 * subset of columns each caller read; the underlying ratios are identical.
 *
 * Not to be confused with the per-settlement time series used for EWMA
 * calibration (see computeSettlementRatiosForCalibration) — that is a
 * genuinely different query grain (one row per settlement, not per
 * marketplace), not a duplicate of this one.
 */
export async function computeHistoricalFeeRatiosByMarketplace(
  prisma: PrismaClient,
  marketplaces: string[]
): Promise<HistoricalFeeRatios[]> {
  const amazonAccountId = getCurrentAccountId();
  const marketplaceList = marketplaces.map((m) => `'${m}'`).join(",");
  const rows = await prisma.$queryRawUnsafe<{
    marketplace: string;
    gross_sales: number; real_payout: number;
    payout_ratio: number;
    r_commission: number; r_fba: number; r_ads: number;
    r_ads_vat: number; r_dsf: number; r_storage: number;
    r_inbound: number; r_prep: number; r_refunds: number;
    r_other: number; r_reimb: number;
    avg_storage_per_sett: number; avg_inbound_per_sett: number;
    n_sett: number;
  }[]>(`
    WITH sett AS (
      SELECT marketplace, SUM("totalAmount") AS real_payout, COUNT(*) AS n_sett
      FROM "AmazonSettlement" WHERE marketplace IN (${marketplaceList}) AND "amazonAccountId" = '${amazonAccountId}'
      GROUP BY marketplace
    ),
    txn AS (
      SELECT s.marketplace,
        SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END) AS gross,
        (-SUM(CASE WHEN t."amountType"='Commission' THEN t.amount ELSE 0 END)) AS commission,
        (-SUM(CASE WHEN t."amountType"='FBAPerUnitFulfillmentFee' THEN t.amount ELSE 0 END)) AS fba,
        (-SUM(CASE WHEN t."amountType"='Cost of Advertising' THEN t.amount ELSE 0 END)) AS ads,
        (-SUM(CASE WHEN t."amountType"='TaxAmount' AND t."transactionType"='ServiceFee' THEN t.amount ELSE 0 END)) AS ads_vat,
        (-SUM(CASE WHEN t."amountType"='DigitalServicesFee' THEN t.amount ELSE 0 END)) AS dsf,
        (-SUM(CASE WHEN t."transactionType" IN ('Storage Fee','StorageRenewalBilling') THEN t.amount ELSE 0 END)) AS storage,
        (-SUM(CASE WHEN t."transactionType"='Inbound Transportation Fee' THEN t.amount ELSE 0 END)) AS inbound,
        (-SUM(CASE WHEN t."transactionType" IN ('WarehousePrep','RemovalComplete','DisposalComplete') THEN t.amount ELSE 0 END)) AS prep,
        (-SUM(CASE WHEN t."transactionType"='Refund' THEN t.amount ELSE 0 END)) AS refunds,
        (-SUM(CASE WHEN t."amountType"='OtherAmount'
            AND t."transactionType" NOT IN ('Storage Fee','StorageRenewalBilling','WarehousePrep','RemovalComplete',
              'DisposalComplete','Inbound Transportation Fee','Current Reserve Amount',
              'Previous Reserve Amount Balance','REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST',
              'WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND') THEN t.amount ELSE 0 END)) AS other,
        SUM(CASE WHEN t."amountType"='OtherAmount'
            AND t."transactionType" IN ('REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST','WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND')
            THEN t.amount ELSE 0 END) AS reimb,
        COUNT(DISTINCT t."settlementId") AS n_sett
      FROM "AmazonSettlementTransaction" t
      JOIN "AmazonSettlement" s ON s."settlementId" = t."settlementId" AND s."amazonAccountId" = t."amazonAccountId"
      WHERE s.marketplace IN (${marketplaceList}) AND s."amazonAccountId" = '${amazonAccountId}'
      GROUP BY s.marketplace
    )
    SELECT
      txn.marketplace,
      txn.gross::FLOAT8 AS gross_sales,
      sett.real_payout::FLOAT8 AS real_payout,
      (sett.real_payout / NULLIF(txn.gross,0))::FLOAT8 AS payout_ratio,
      (txn.commission / NULLIF(txn.gross,0))::FLOAT8 AS r_commission,
      (txn.fba       / NULLIF(txn.gross,0))::FLOAT8 AS r_fba,
      (txn.ads       / NULLIF(txn.gross,0))::FLOAT8 AS r_ads,
      (txn.ads_vat   / NULLIF(txn.gross,0))::FLOAT8 AS r_ads_vat,
      (txn.dsf       / NULLIF(txn.gross,0))::FLOAT8 AS r_dsf,
      (txn.storage   / NULLIF(txn.gross,0))::FLOAT8 AS r_storage,
      (txn.inbound   / NULLIF(txn.gross,0))::FLOAT8 AS r_inbound,
      (txn.prep      / NULLIF(txn.gross,0))::FLOAT8 AS r_prep,
      (txn.refunds   / NULLIF(txn.gross,0))::FLOAT8 AS r_refunds,
      (txn.other     / NULLIF(txn.gross,0))::FLOAT8 AS r_other,
      (txn.reimb     / NULLIF(txn.gross,0))::FLOAT8 AS r_reimb,
      (txn.storage   / NULLIF(txn.n_sett,0))::FLOAT8 AS avg_storage_per_sett,
      (txn.inbound   / NULLIF(txn.n_sett,0))::FLOAT8 AS avg_inbound_per_sett,
      sett.n_sett::INTEGER AS n_sett
    FROM txn JOIN sett ON sett.marketplace = txn.marketplace
    ORDER BY txn.gross DESC
  `);

  return rows.map((r) => ({
    marketplace: r.marketplace,
    grossSales: Number(r.gross_sales),
    realPayout: Number(r.real_payout),
    payoutRatio: Number(r.payout_ratio),
    rCommission: Number(r.r_commission),
    rFba: Number(r.r_fba),
    rAds: Number(r.r_ads),
    rAdsVat: Number(r.r_ads_vat),
    rDsf: Number(r.r_dsf),
    rStorage: Number(r.r_storage),
    rInbound: Number(r.r_inbound),
    rPrep: Number(r.r_prep),
    rRefunds: Number(r.r_refunds),
    rOther: Number(r.r_other),
    rReimb: Number(r.r_reimb),
    avgStoragePerSett: Number(r.avg_storage_per_sett),
    avgInboundPerSett: Number(r.avg_inbound_per_sett),
    nSett: Number(r.n_sett),
  }));
}

// ─── Per-settlement fee ratios (time series, for EWMA calibration) ────────────

export interface SettlementFeeRatios {
  settlementId: string;
  settlementDate: string;
  realPayout: number;
  gross: number;
  commission: number; fba: number; ads: number; adsVat: number; dsf: number;
  storage: number; inbound: number; prep: number; refunds: number; other: number; reimb: number;
}

/**
 * Per-settlement fee breakdown for one marketplace, most recent `lastN`
 * settlements. Used for EWMA calibration (a time series of individual
 * settlements), NOT the same query grain as computeHistoricalFeeRatiosByMarketplace
 * (a single aggregate row per marketplace summed across all settlements) —
 * the two share the same fee-categorization CASE WHEN logic but serve
 * different purposes and must not be merged into one function.
 */
export async function computeSettlementRatiosForCalibration(
  prisma: PrismaClient,
  marketplace: string,
  lastN = 30
): Promise<SettlementFeeRatios[]> {
  const amazonAccountId = getCurrentAccountId();
  const rows = await prisma.$queryRawUnsafe<{
    settlement_id: string;
    settlement_date: string;
    real_payout: number; gross: number; commission: number; fba: number;
    ads: number; ads_vat: number; dsf: number; storage: number;
    inbound: number; prep: number; refunds: number; other: number; reimb: number;
  }[]>(`
    SELECT
      s."settlementId" AS settlement_id,
      s."endDate"::date::text AS settlement_date,
      s."totalAmount"::FLOAT8 AS real_payout,
      SUM(CASE WHEN t."amountType"='Principal' AND t."transactionType"='Order' THEN t.amount ELSE 0 END)::FLOAT8 AS gross,
      ABS(SUM(CASE WHEN t."amountType"='Commission'                         THEN t.amount ELSE 0 END))::FLOAT8 AS commission,
      ABS(SUM(CASE WHEN t."amountType"='FBAPerUnitFulfillmentFee'           THEN t.amount ELSE 0 END))::FLOAT8 AS fba,
      ABS(SUM(CASE WHEN t."amountType"='Cost of Advertising'                THEN t.amount ELSE 0 END))::FLOAT8 AS ads,
      ABS(SUM(CASE WHEN t."amountType"='TaxAmount' AND t."transactionType"='ServiceFee' THEN t.amount ELSE 0 END))::FLOAT8 AS ads_vat,
      ABS(SUM(CASE WHEN t."amountType"='DigitalServicesFee'                 THEN t.amount ELSE 0 END))::FLOAT8 AS dsf,
      ABS(SUM(CASE WHEN t."transactionType" IN ('Storage Fee','StorageRenewalBilling') THEN t.amount ELSE 0 END))::FLOAT8 AS storage,
      ABS(SUM(CASE WHEN t."transactionType"='Inbound Transportation Fee'    THEN t.amount ELSE 0 END))::FLOAT8 AS inbound,
      ABS(SUM(CASE WHEN t."transactionType" IN ('WarehousePrep','RemovalComplete','DisposalComplete') THEN t.amount ELSE 0 END))::FLOAT8 AS prep,
      ABS(SUM(CASE WHEN t."transactionType"='Refund'                        THEN t.amount ELSE 0 END))::FLOAT8 AS refunds,
      ABS(SUM(CASE WHEN t."amountType"='OtherAmount'
          AND t."transactionType" NOT IN ('Storage Fee','StorageRenewalBilling','WarehousePrep','RemovalComplete',
            'DisposalComplete','Inbound Transportation Fee','Current Reserve Amount',
            'Previous Reserve Amount Balance','REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST',
            'WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND') THEN t.amount ELSE 0 END))::FLOAT8 AS other,
      SUM(CASE WHEN t."amountType"='OtherAmount'
          AND t."transactionType" IN ('REVERSAL_REIMBURSEMENT','WAREHOUSE_LOST','WAREHOUSE_DAMAGE','MISSING_FROM_INBOUND')
          THEN t.amount ELSE 0 END)::FLOAT8 AS reimb
    FROM "AmazonSettlement" s
    JOIN "AmazonSettlementTransaction" t ON t."settlementId" = s."settlementId" AND t."amazonAccountId" = s."amazonAccountId"
    WHERE s.marketplace = '${marketplace}' AND s."amazonAccountId" = '${amazonAccountId}'
    GROUP BY s."settlementId", s."endDate", s."totalAmount"
    ORDER BY s."endDate" ASC
    LIMIT ${lastN}
  `);

  return rows.map((r) => ({
    settlementId: r.settlement_id,
    settlementDate: r.settlement_date,
    realPayout: Number(r.real_payout),
    gross: Number(r.gross),
    commission: Number(r.commission),
    fba: Number(r.fba),
    ads: Number(r.ads),
    adsVat: Number(r.ads_vat),
    dsf: Number(r.dsf),
    storage: Number(r.storage),
    inbound: Number(r.inbound),
    prep: Number(r.prep),
    refunds: Number(r.refunds),
    other: Number(r.other),
    reimb: Number(r.reimb),
  }));
}
