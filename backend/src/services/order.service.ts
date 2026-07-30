// order.service.ts — Normalize Shopify orders and upsert into DB
import { prisma } from "../db";
import { ShopifyRawOrder } from "./shopify.service";
import { detectMarketplace } from "../config/marketplace-rules";
import { upsertLineItems } from "./product.service";
import { upsertShopifyOrder } from "../repositories/shopify/orders.repo";

function extractChannelName(order: ShopifyRawOrder): string | null {
  return (
    order.channelInformation?.channelDefinition?.channelName ??
    order.channelInformation?.app?.title ??
    null
  );
}

function numericGid(gid: string): string {
  // "gid://shopify/Order/12345" → "12345"
  return gid.split("/").pop() ?? gid;
}

export async function upsertOrder(raw: ShopifyRawOrder): Promise<string | null> {
  if (raw.test) return null; // skip test orders

  const channelDisplayName = extractChannelName(raw);
  const detection = detectMarketplace(
    raw.tags ?? [],
    raw.sourceName,
    channelDisplayName
  );

  const totalAmount = parseFloat(
    raw.currentTotalPriceSet?.shopMoney?.amount ?? "0"
  );
  const refundedAmount = parseFloat(
    raw.totalRefundedSet?.shopMoney?.amount ?? "0"
  );
  const netAmount = totalAmount - refundedAmount;

  const order = await upsertShopifyOrder(
    prisma,
    {
      shopifyOrderId: raw.id,
      orderName: raw.name,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      processedAt: raw.processedAt ? new Date(raw.processedAt) : null,
      cancelledAt: raw.cancelledAt ? new Date(raw.cancelledAt) : null,
      closedAt: raw.closedAt ? new Date(raw.closedAt) : null,
      totalAmount,
      currency: raw.currentTotalPriceSet?.shopMoney?.currencyCode ?? "EUR",
      financialStatus: raw.displayFinancialStatus,
      fulfillmentStatus: raw.displayFulfillmentStatus,
      rawTags: raw.tags ?? [],
      sourceName: raw.sourceName,
      sourceIdentifier: raw.sourceIdentifier,
      channelDisplayName,
      customerCountry: raw.shippingAddress?.countryCode ?? null,
      customerEmail: raw.customer?.email ?? null,
      marketplaceDetected: detection.marketplace,
      marketplaceDetectionReason: detection.reason,
      isRefunded: refundedAmount > 0,
      refundedAmount,
      netAmount,
      isCancelled: !!raw.cancelledAt,
      isTest: raw.test,
      lineItemsCount: raw.lineItems?.edges?.length ?? 0,
      rawData: raw as any,
    },
    {
      updatedAt: new Date(raw.updatedAt),
      cancelledAt: raw.cancelledAt ? new Date(raw.cancelledAt) : null,
      closedAt: raw.closedAt ? new Date(raw.closedAt) : null,
      totalAmount,
      financialStatus: raw.displayFinancialStatus,
      fulfillmentStatus: raw.displayFulfillmentStatus,
      rawTags: raw.tags ?? [],
      sourceName: raw.sourceName,
      channelDisplayName,
      marketplaceDetected: detection.marketplace,
      marketplaceDetectionReason: detection.reason,
      isRefunded: refundedAmount > 0,
      refundedAmount,
      netAmount,
      isCancelled: !!raw.cancelledAt,
      rawData: raw as any,
      syncedAt: new Date(),
    },
    raw.id
  );

  // Upsert line items for product tracking
  if (raw.lineItems?.edges?.length > 0) {
    await upsertLineItems(
      raw.lineItems.edges,
      order.id,
      detection.marketplace,
      new Date(raw.createdAt),
      raw.currentTotalPriceSet?.shopMoney?.currencyCode ?? "EUR"
    );
  }

  return order.id;
}

export async function processOrderBatch(
  orders: ShopifyRawOrder[]
): Promise<{ ok: number; errors: number }> {
  let ok = 0;
  let errors = 0;
  for (const order of orders) {
    try {
      await upsertOrder(order);
      ok++;
    } catch (err) {
      errors++;
      console.error(`[OrderService] Failed to upsert ${order.id}:`, err);
    }
  }
  return { ok, errors };
}
