// ppc-cycle.repo.ts — Repository layer for the Amazon Ads threshold-billing cycle:
// AmazonAdsPaymentEvent (Finances API ads charges) plus the reads that feed
// the pure ledger in amazon/ppc-cycle.ts.
// Every operation is scoped to the current Amazon account(s) (context/account-context.ts).
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getCurrentAccountId, getCurrentAccountIds } from "../../context/account-context";
import { italyDateString } from "../../amazon/utils/datetime";
import { summarizePpcCycle, type PpcCharge, type PpcCycleSummary } from "../../amazon/ppc-cycle";

/**
 * Amazon charges the ads invoice at €500 + VAT. The threshold is net of VAT,
 * like the Ads API spend it is compared with.
 */
export const PPC_BILLING_THRESHOLD_EUR = 500;
/** The threshold invoice covers Amazon.it campaigns only. */
export const PPC_BILLING_MARKETPLACE = "IT";
/** How far back charges and spend are replayed through the ledger. */
const LEDGER_LOOKBACK_DAYS = 90;
const DAY_MS = 86_400_000;

export interface AdsPaymentEventInput {
  invoiceId: string;
  transactionType: string;
  postedDate: Date;
  baseValue: number;
  taxValue: number;
  transactionValue: number;
  currency: string;
  rawPayload: Prisma.InputJsonValue;
}

export type PpcChargeSource = "financial_events" | "settlement";

export interface PpcBillingCycle extends Omit<PpcCycleSummary, "lastCharge"> {
  accountId: string;
  accountName: string;
  lastCharge: {
    invoiceId: string;
    date: string;
    /** Billed amount net of VAT. */
    amount: number;
    /** Amount deducted from the seller balance, VAT included. */
    totalAmount: number;
    source: PpcChargeSource;
  } | null;
}

// ─── AmazonAdsPaymentEvent operations ─────────────────────────────────────────

/** Idempotent upsert of Finances API ads payment events for the current account. */
export async function upsertAdsPaymentEvents(
  prisma: PrismaClient,
  events: AdsPaymentEventInput[],
): Promise<number> {
  const amazonAccountId = getCurrentAccountId();
  for (const event of events) {
    const values = {
      baseValue: event.baseValue,
      taxValue: event.taxValue,
      transactionValue: event.transactionValue,
      currency: event.currency,
      rawPayload: event.rawPayload,
    };
    await prisma.amazonAdsPaymentEvent.upsert({
      where: {
        amazonAccountId_invoiceId_transactionType_postedDate: {
          amazonAccountId,
          invoiceId: event.invoiceId,
          transactionType: event.transactionType,
          postedDate: event.postedDate,
        },
      },
      create: {
        amazonAccountId,
        invoiceId: event.invoiceId,
        transactionType: event.transactionType,
        postedDate: event.postedDate,
        ...values,
      },
      update: values,
    });
  }
  return events.length;
}

// ─── Cycle reads ──────────────────────────────────────────────────────────────

type SourcedCharge = PpcCharge & { accountId: string; source: PpcChargeSource };

async function findFinancesCharges(
  prisma: PrismaClient,
  accountIds: string[],
  since: Date,
): Promise<SourcedCharge[]> {
  const rows = await prisma.amazonAdsPaymentEvent.findMany({
    where: { amazonAccountId: { in: accountIds }, transactionType: "charge", postedDate: { gte: since } },
    select: { amazonAccountId: true, invoiceId: true, postedDate: true, baseValue: true, transactionValue: true },
  });
  // Stored as Amazon sent them; a charge may arrive signed as a deduction.
  return rows.map((row) => ({
    accountId: row.amazonAccountId,
    invoiceId: row.invoiceId,
    date: italyDateString(row.postedDate),
    baseAmount: Math.abs(Number(row.baseValue)),
    totalAmount: Math.abs(Number(row.transactionValue)),
    source: "financial_events",
  }));
}

/**
 * Fallback for accounts whose Finances events are not synced yet: the
 * advertising ServiceFee rows of closed settlements (VAT treatment unknown,
 * so the deducted amount is used for both values).
 */
async function findSettlementCharges(
  prisma: PrismaClient,
  accountIds: string[],
  since: Date,
): Promise<SourcedCharge[]> {
  const rows = await prisma.$queryRaw<Array<{
    account_id: string;
    settlement_id: string;
    charge_date: string;
    amount: number;
  }>>(Prisma.sql`
    SELECT
      t."amazonAccountId" AS account_id,
      t."settlementId" AS settlement_id,
      ((t."postedDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date::text AS charge_date,
      ABS(SUM(t.amount))::FLOAT8 AS amount
    FROM "AmazonSettlementTransaction" t
    WHERE t."amazonAccountId" IN (${Prisma.join(accountIds)})
      AND t."postedDate" >= ${since}
      AND t."transactionType" = 'ServiceFee'
      AND (
        t."amountType" ILIKE '%advertising%'
        OR t."amountType" ILIKE '%cost per click%'
        OR t."amountType" ILIKE '%sponsored%'
      )
    GROUP BY 1, 2, 3
    HAVING ABS(SUM(t.amount)) > 0
  `);
  return rows.map((row) => ({
    accountId: row.account_id,
    invoiceId: row.settlement_id,
    date: row.charge_date,
    baseAmount: Number(row.amount),
    totalAmount: Number(row.amount),
    source: "settlement",
  }));
}

async function findItalySpendByDay(
  prisma: PrismaClient,
  accountIds: string[],
  sinceDate: string,
): Promise<Array<{ accountId: string; date: string; spend: number }>> {
  const rows = await prisma.amazonAdSnapshot.groupBy({
    by: ["amazonAccountId", "snapshotDate"],
    where: {
      amazonAccountId: { in: accountIds },
      marketplace: PPC_BILLING_MARKETPLACE,
      snapshotDate: { gte: new Date(`${sinceDate}T00:00:00.000Z`) },
    },
    _sum: { spend: true },
  });
  // snapshotDate is stored as UTC midnight of the Italian civil date.
  return rows.map((row) => ({
    accountId: row.amazonAccountId,
    date: row.snapshotDate.toISOString().slice(0, 10),
    spend: Number(row._sum.spend ?? 0),
  }));
}

/**
 * One threshold cycle per account in scope. The latest real ads charge
 * (Finances events, or settlements until those are synced) starts the cycle;
 * reaching the threshold alone never resets it.
 */
export async function findPpcBillingCycles(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<PpcBillingCycle[]> {
  const accountIds = getCurrentAccountIds();
  if (accountIds.length === 0) return [];

  const since = new Date(now.getTime() - LEDGER_LOOKBACK_DAYS * DAY_MS);
  const [accounts, financesCharges, settlementCharges, spend] = await Promise.all([
    prisma.amazonAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }),
    findFinancesCharges(prisma, accountIds, since),
    findSettlementCharges(prisma, accountIds, since),
    findItalySpendByDay(prisma, accountIds, italyDateString(since)),
  ]);
  const nameByAccount = new Map(accounts.map((row) => [row.id, row.name]));

  return accountIds.map((accountId) => {
    const fromFinances = financesCharges.filter((charge) => charge.accountId === accountId);
    const charges = fromFinances.length > 0
      ? fromFinances
      : settlementCharges.filter((charge) => charge.accountId === accountId);
    const source = charges[0]?.source ?? "financial_events";
    const summary = summarizePpcCycle({
      spend: spend.filter((day) => day.accountId === accountId),
      charges,
      threshold: PPC_BILLING_THRESHOLD_EUR,
    });

    return {
      ...summary,
      accountId,
      accountName: nameByAccount.get(accountId) ?? "Account Amazon",
      lastCharge: summary.lastCharge
        ? {
            invoiceId: summary.lastCharge.invoiceId,
            date: summary.lastCharge.date,
            amount: summary.lastCharge.baseAmount,
            totalAmount: summary.lastCharge.totalAmount,
            source,
          }
        : null,
    };
  });
}
