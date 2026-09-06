// Repository layer for daily marketplace advertising costs.
import type { MarketplaceAdSpend, PrismaClient } from "@prisma/client";

export interface DailyAdSpendInput {
  spendDate: Date;
  marketplace: string;
  amount: number;
  source?: string;
  note?: string | null;
}

export async function upsertDailyAdSpend(
  prisma: PrismaClient,
  input: DailyAdSpendInput,
  actorId?: string | null,
): Promise<MarketplaceAdSpend> {
  return prisma.$transaction(async (tx) => {
    const key = {
      spendDate: input.spendDate,
      marketplace: input.marketplace,
    };
    const previous = await tx.marketplaceAdSpend.findUnique({
      where: { spendDate_marketplace: key },
    });
    const saved = await tx.marketplaceAdSpend.upsert({
      where: { spendDate_marketplace: key },
      create: {
        ...key,
        amount: input.amount,
        source: input.source ?? "MANUAL",
        note: input.note ?? null,
      },
      update: {
        amount: input.amount,
        source: input.source ?? "MANUAL",
        note: input.note ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "MARKETPLACE_AD_SPEND_UPSERT",
        details: {
          entityId: saved.id,
          marketplace: input.marketplace,
          spendDate: input.spendDate.toISOString().slice(0, 10),
          previousAmount: previous ? String(previous.amount) : null,
          amount: String(input.amount),
          source: input.source ?? "MANUAL",
        },
      },
    });
    return saved;
  });
}

export async function findDailyAdSpends(
  prisma: PrismaClient,
  params: { from: Date; to: Date; marketplace?: string },
): Promise<MarketplaceAdSpend[]> {
  return prisma.marketplaceAdSpend.findMany({
    where: {
      spendDate: { gte: params.from, lte: params.to },
      ...(params.marketplace ? { marketplace: params.marketplace } : {}),
    },
    orderBy: [{ spendDate: "desc" }, { marketplace: "asc" }],
  });
}

export async function deleteDailyAdSpend(
  prisma: PrismaClient,
  id: string,
  actorId?: string | null,
): Promise<MarketplaceAdSpend> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceAdSpend.findUniqueOrThrow({ where: { id } });
    const deleted = await tx.marketplaceAdSpend.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "MARKETPLACE_AD_SPEND_DELETE",
        details: {
          entityId: existing.id,
          marketplace: existing.marketplace,
          spendDate: existing.spendDate.toISOString().slice(0, 10),
          amount: String(existing.amount),
          source: existing.source,
        },
      },
    });
    return deleted;
  });
}
