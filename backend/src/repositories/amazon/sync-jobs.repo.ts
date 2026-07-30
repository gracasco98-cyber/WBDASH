// sync-jobs.repo.ts — Repository layer for AmazonSyncJob entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AmazonSyncJob } from "@prisma/client";

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Find the most recent sync jobs (default: last 100), ordered by startedAt DESC.
 */
export async function findRecentSyncJobs(
  prisma: PrismaClient,
  take = 100
): Promise<AmazonSyncJob[]> {
  return prisma.amazonSyncJob.findMany({
    orderBy: { startedAt: "desc" },
    take,
  });
}

/**
 * Count sync jobs by status. Used for DB stats / verification.
 */
export async function countSyncJobsByStatus(
  prisma: PrismaClient,
  status: string
): Promise<number> {
  return prisma.amazonSyncJob.count({ where: { status } });
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Create a new sync job record (status = "running").
 * Returns the ID of the created job.
 */
export async function createSyncJob(
  prisma: PrismaClient,
  params: { jobType: string; marketplace: string; dateFrom: Date; dateTo: Date }
): Promise<string> {
  const job = await prisma.amazonSyncJob.create({
    data: {
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
