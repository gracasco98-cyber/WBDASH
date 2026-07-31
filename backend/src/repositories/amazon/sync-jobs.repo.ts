// sync-jobs.repo.ts — Repository layer for AmazonSyncJob entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
// Every operation is scoped to the current Amazon account (see
// context/account-context.ts) — reads never leak another account's jobs,
// writes always attach the account they belong to.
import type { PrismaClient, AmazonSyncJob } from "@prisma/client";
import { getCurrentAccountId } from "../../context/account-context";

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Find the most recent sync jobs for the current account (default: last 100), ordered by startedAt DESC.
 */
export async function findRecentSyncJobs(
  prisma: PrismaClient,
  take = 100
): Promise<AmazonSyncJob[]> {
  return prisma.amazonSyncJob.findMany({
    where: { amazonAccountId: getCurrentAccountId() },
    orderBy: { startedAt: "desc" },
    take,
  });
}

/**
 * Count sync jobs by status for the current account. Used for DB stats / verification.
 */
export async function countSyncJobsByStatus(
  prisma: PrismaClient,
  status: string
): Promise<number> {
  return prisma.amazonSyncJob.count({
    where: { status, amazonAccountId: getCurrentAccountId() },
  });
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Create a new sync job record (status = "running") for the current account.
 * Returns the ID of the created job.
 */
export async function createSyncJob(
  prisma: PrismaClient,
  params: { jobType: string; marketplace: string; dateFrom: Date; dateTo: Date }
): Promise<string> {
  const job = await prisma.amazonSyncJob.create({
    data: {
      amazonAccountId: getCurrentAccountId(),
      jobType:     params.jobType,
      marketplace: params.marketplace,
      dateFrom:    params.dateFrom,
      dateTo:      params.dateTo,
      status:      "running",
    },
  });
  return job.id;
}

/**
 * Mark a sync job as done or failed.
 * `id` is the job's own primary key (globally unique), so no account filter is needed here.
 */
export async function finishSyncJob(
  prisma: PrismaClient,
  id: string,
  stats: { recordsIn: number; recordsImported: number; recordsUpdated: number; recordsRejected: number },
  error?: string
): Promise<void> {
  await prisma.amazonSyncJob.update({
    where: { id },
    data: {
      status:          error ? "failed" : "done",
      recordsIn:       stats.recordsIn,
      recordsImported: stats.recordsImported,
      recordsUpdated:  stats.recordsUpdated,
      recordsRejected: stats.recordsRejected,
      errorMessage:    error ?? null,
      completedAt:     new Date(),
    },
  });
}
