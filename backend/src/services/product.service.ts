// product.service.ts — Line item and product snapshot management
import { prisma } from "../db";
import { ShopifyLineItem } from "./shopify.service";
import { upsertLineItem, groupLineItemsForSnapshot, findLineItemSample } from "../repositories/shopify/line-items.repo";
import { upsertProductSnapshot } from "../repositories/shopify/product-snapshots.repo";

// ─── Upsert line items from a Shopify order ───────────────────────────────────
export async function upsertLineItems(
  edges: Array<{ node: ShopifyLineItem }>,
  dbOrderId: string,
  marketplace: string,
  orderDate: Date,
  currency: string
): Promise<void> {
  for (const edge of edges) {
    const item = edge.node;
    const unitPrice = parseFloat(item.discountedUnitPriceSet?.shopMoney?.amount ?? "0");
    const originalUnitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount ?? "0");
    const totalDiscount = parseFloat(item.totalDiscountSet?.shopMoney?.amount ?? "0");
    const lineTotal = unitPrice * item.quantity;

    // Build a stable product ID: use Shopify product GID or fall back to sku/title
    const shopifyProductId =
      item.variant?.product?.id ??
      (item.sku ? `sku:${item.sku}` : `title:${encodeURIComponent(item.title)}`);

    const variantId = item.variant?.id ?? null;
    const imageUrl =
      item.image?.url ??
      item.variant?.product?.featuredImage?.url ??
      null;

    try {
      await upsertLineItem(
        prisma,
        item.id,
        {
          shopifyLineItemId: item.id,
          orderId: dbOrderId,
          shopifyProductId,
          productTitle: item.title,
          variantId,
          variantTitle: item.variantTitle,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice,
          originalUnitPrice,
          totalDiscount,
          lineTotal,
          currency,
          imageUrl,
          marketplace,
          orderDate,
        },
        {
          quantity: item.quantity,
          unitPrice,
          originalUnitPrice,
          totalDiscount,
          lineTotal,
          marketplace,
          imageUrl: imageUrl ?? undefined,
        }
      );
    } catch (err) {
      console.error(`[ProductService] Failed to upsert line item ${item.id}:`, err);
    }
  }
}

// ─── Compute daily snapshot for a given date ─────────────────────────────────
export async function computeDailySnapshot(date: Date): Promise<number> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Aggregate line items for the day, grouped by product + marketplace
  const groups = await groupLineItemsForSnapshot(prisma, { from: dayStart, to: dayEnd });

  let snapshotCount = 0;

  for (const group of groups) {
    // Get representative product info for this product+marketplace combo
    const sample = await findLineItemSample(prisma, {
      shopifyProductId: group.shopifyProductId,
      marketplace: group.marketplace,
      from: dayStart,
      to: dayEnd,
    });

    if (!sample) continue;

    const unitsSold = group._sum.quantity ?? 0;
    const grossRevenue = group._sum.lineTotal ?? 0;
    const refundedAmount = group._sum.refundedAmount ?? 0;
    const netRevenue = grossRevenue - refundedAmount;

    await upsertProductSnapshot(prisma, {
      snapshotDate: dayStart,
      shopifyProductId: group.shopifyProductId,
      marketplace: group.marketplace,
      create: {
        snapshotDate: dayStart,
        shopifyProductId: group.shopifyProductId,
        productTitle: sample.productTitle,
        sku: sample.sku,
        marketplace: group.marketplace,
        imageUrl: sample.imageUrl,
        unitsSold,
        grossRevenue,
        refundedAmount,
        netRevenue,
        orderCount: group._count.id,
      },
      update: {
        unitsSold,
        grossRevenue,
        refundedAmount,
        netRevenue,
        orderCount: group._count.id,
        productTitle: sample.productTitle,
        imageUrl: sample.imageUrl ?? undefined,
      },
    });

    snapshotCount++;
  }

  return snapshotCount;
}

// ─── Run daily snapshot for yesterday + today ─────────────────────────────────
export async function runDailySnapshotJob(): Promise<void> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  console.log("[Snapshot] Computing snapshots for yesterday and today...");
  const [y, t] = await Promise.all([
    computeDailySnapshot(yesterday),
    computeDailySnapshot(today),
  ]);
  console.log(`[Snapshot] Done. Yesterday: ${y} products, Today: ${t} products`);
}

// ─── Compute full 90-day historical snapshots ─────────────────────────────────
export async function computeAllHistoricalSnapshots(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 90);

  console.log("[Snapshot] Starting full historical computation (90 days)...");
  let totalSnapshots = 0;
  let daysProcessed = 0;

  const current = new Date(start);
  while (current <= today) {
    const count = await computeDailySnapshot(new Date(current));
    totalSnapshots += count;
    daysProcessed++;
    if (daysProcessed % 10 === 0) {
      console.log(`[Snapshot] Progress: ${daysProcessed} days, ${totalSnapshots} snapshots`);
    }
    current.setDate(current.getDate() + 1);
  }

  console.log(`[Snapshot] Full history done: ${daysProcessed} days, ${totalSnapshots} product-day snapshots`);
}
