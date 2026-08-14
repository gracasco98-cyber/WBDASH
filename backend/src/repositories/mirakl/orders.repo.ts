// orders.repo.ts — Repository layer for MiraklOrder entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// No business logic here — only typed data access.
import type { PrismaClient, MiraklOrder } from "@prisma/client";

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
  return prisma.miraklOrder.update({
    where: { miraklOrderId },
    data: { miraklState: "ACCEPTED" },
  });
}

export async function markShipped(
  prisma: PrismaClient,
  shopifyOrderId: string,
  trackingNumber: string
): Promise<MiraklOrder> {
  return prisma.miraklOrder.update({
    where: { shopifyOrderId },
    data: {
      miraklState: "SHIPPED",
      trackingNumber,
      trackingSyncedAt: new Date(),
    },
  });
}
