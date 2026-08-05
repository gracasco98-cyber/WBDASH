// error-log.repo.ts — Repository layer for the AppErrorLog entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, AppErrorLog } from "@prisma/client";

export async function findRecentErrors(prisma: PrismaClient, take = 50): Promise<AppErrorLog[]> {
  return prisma.appErrorLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
}
