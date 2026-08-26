// orders.repo.ts — Repository layer for MiraklOrder entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, MiraklOrder } from "@prisma/client";

export class InvalidMiraklTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transizione MiraklOrder non valida: ${from} → ${to}`);
    this.name = "InvalidMiraklTransitionError";
  }
}

export async function findByMiraklOrderId(
  prisma: PrismaClient,
  miraklOrderId: string
): Promise<MiraklOrder | null> {
  return prisma.miraklOrder.findUnique({ where: { miraklOrderId } });
}

export async function findByShopifyOrderId(
  prisma: PrismaClient,
  shopifyOrderId: string
): Promise<MiraklOrder | null> {
  return prisma.miraklOrder.findUnique({ where: { shopifyOrderId } });
}

export async function findAllMiraklOrders(prisma: PrismaClient): Promise<MiraklOrder[]> {
  return prisma.miraklOrder.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createPendingAcceptOrder(
  prisma: PrismaClient,
  data: { miraklOrderId: string; shopifyOrderId: string; country: string }
): Promise<MiraklOrder> {
  return prisma.miraklOrder.create({
    data: { ...data, miraklState: "PENDING_ACCEPT" },
  });
}

export async function markAccepted(
  prisma: PrismaClient,
  miraklOrderId: string
): Promise<MiraklOrder> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.miraklOrder.findUniqueOrThrow({
      where: { miraklOrderId },
      select: { miraklState: true },
    });
    if (current.miraklState !== "PENDING_ACCEPT") {
      throw new InvalidMiraklTransitionError(current.miraklState, "ACCEPTED");
    }
    return tx.miraklOrder.update({
      where: { miraklOrderId },
      data: { miraklState: "ACCEPTED" },
    });
  });
}

export async function markShipped(
  prisma: PrismaClient,
  shopifyOrderId: string,
  trackingNumber: string
): Promise<MiraklOrder> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.miraklOrder.findUniqueOrThrow({
      where: { shopifyOrderId },
      select: { miraklState: true },
    });
    if (current.miraklState !== "ACCEPTED") {
      throw new InvalidMiraklTransitionError(current.miraklState, "SHIPPED");
    }
    return tx.miraklOrder.update({
      where: { shopifyOrderId },
      data: { miraklState: "SHIPPED", trackingNumber, trackingSyncedAt: new Date() },
    });
  });
}
