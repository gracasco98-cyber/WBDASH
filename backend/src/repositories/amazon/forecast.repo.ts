// forecast.repo.ts — Repository layer for AmazonForecastCalibration + AmazonForecastSnapshot.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
// The EWMA math, bias detection, and structural break logic STAY in forecast-calibration.service.ts.
// Every operation is scoped to the current Amazon account (context/account-context.ts).
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";

// ─── AmazonForecastCalibration ────────────────────────────────────────────────

/**
 * Find the calibration record for a marketplace, within the current account.
 * NOTE: (amazonAccountId, marketplace) is UNIQUE — at most one record per pair.
 */
export async function findCalibrationByMarketplace(
  prisma: PrismaClient,
  marketplace: string
): Promise<any | null> {
  return prisma.amazonForecastCalibration.findUnique({
    where: { amazonAccountId_marketplace: { amazonAccountId: getCurrentAccountId(), marketplace } },
  });
}

/**
 * Find all calibration records for the current account, ordered by marketplace ASC.
 * Used by the calibration status endpoint.
 */
export async function findAllCalibrations(prisma: PrismaClient): Promise<any[]> {
  return prisma.amazonForecastCalibration.findMany({
    where: { amazonAccountId: getCurrentAccountId() },
    orderBy: { marketplace: "asc" },
  });
}

/**
 * Update component model parameters (FBA/unit, PPC avg, refund lag) for a marketplace.
 */
export async function updateCalibrationComponents(
  prisma: PrismaClient,
  marketplace: string,
  data: {
    avgFbaPerUnit: number;
    avgUnitsPerOrder: number;
    refundLagDays: number;
    ppcDailyAvg7d: number;
    ppcDailyAvg30d: number;
  }
): Promise<{ count: number }> {
  return prisma.amazonForecastCalibration.updateMany({
    where: { marketplace, amazonAccountId: getCurrentAccountId() },
    data,
  });
}

/**
 * Update a calibration record by marketplace (full update from updateCalibrationFromActual).
 * All fields passed explicitly — the service computes them.
 */
export async function updateCalibrationRecord(
  prisma: PrismaClient,
  marketplace: string,
  data: Record<string, unknown>
): Promise<void> {
  await prisma.amazonForecastCalibration.update({
    where: { amazonAccountId_marketplace: { amazonAccountId: getCurrentAccountId(), marketplace } },
    data: data as any,
  });
}

/**
 * Upsert a calibration record by marketplace (unique key), scoped to the current account.
 * Used by bootstrapCalibration and bootstrapFromExcel.
 */
export async function upsertCalibration(
  prisma: PrismaClient,
  marketplace: string,
  create: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<void> {
  const amazonAccountId = getCurrentAccountId();
  await prisma.amazonForecastCalibration.upsert({
    where:  { amazonAccountId_marketplace: { amazonAccountId, marketplace } },
    create: { ...create, amazonAccountId, marketplace } as any,
    update: update as any,
  });
}

// ─── AmazonForecastSnapshot ───────────────────────────────────────────────────

/**
 * Find the most recent unreconciled snapshot for a marketplace + periodEnd
 * that was created within the last 24h. Used to decide whether to update or create.
 */
export async function findRecentForecastSnapshot(
  prisma: PrismaClient,
  params: { marketplace: string; periodEnd: string; cutoff: Date }
): Promise<{ id: string } | null> {
  return prisma.amazonForecastSnapshot.findFirst({
    where: {
      amazonAccountId: getCurrentAccountId(),
      marketplace:  params.marketplace,
      periodEnd:    params.periodEnd,
      reconciledAt: null,
      snapshotDate: { gte: params.cutoff },
    },
    orderBy: { snapshotDate: "desc" },
  });
}

/**
 * Create a new forecast snapshot for the current account.
 */
export async function createForecastSnapshot(
  prisma: PrismaClient,
  data: {
    marketplace:    string;
    periodStart:    string;
    periodEnd:      string;
    depositEst:     string;
    forecastGross:  number;
    forecastNet:    number;
    forecastFees:   number;
    payoutRatioPct: number;
    totalOrders:    number;
  }
): Promise<void> {
  await prisma.amazonForecastSnapshot.create({
    data: { ...data, amazonAccountId: getCurrentAccountId() },
  });
}

/**
 * Update an existing forecast snapshot by ID.
 * `id` is the snapshot's own primary key (globally unique), so no account filter is needed here.
 */
export async function updateForecastSnapshot(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await prisma.amazonForecastSnapshot.update({
    where: { id },
    data: data as any,
  });
}

/**
 * Find all unreconciled snapshots for the current account whose periodEnd <= today.
 * Used by reconcileForecastSnapshots().
 */
export async function findPendingReconciliationSnapshots(
  prisma: PrismaClient,
  today: string
): Promise<any[]> {
  return prisma.amazonForecastSnapshot.findMany({
    where: {
      amazonAccountId: getCurrentAccountId(),
      reconciledAt: null,
      periodEnd: { lte: today },
    },
  });
}
