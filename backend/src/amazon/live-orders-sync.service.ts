import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";
import { broadcast } from "../sse/sse";
import { findAmazonOrderSyncStates, AmazonOrderSyncState } from "../repositories/amazon/orders.repo";
import { ALL_EU_MARKETPLACE_IDS, ALL_NA_MARKETPLACE_IDS, MARKETPLACE_IDS, SALES_CHANNEL_TO_MARKETPLACE } from "./config";
import { ingestOrderRows, IngestStats } from "./ingest.service";
import {
  fetchOrderItems,
  fetchOrdersCreatedSince,
  SpApiOrder,
  SpApiOrderItem,
  SpRegion,
} from "./sp-api.service";
import { hasNACredentials } from "./token.service";
import { italyDayStart } from "./utils/datetime";

const DAY_MS = 86_400_000;
const ORDER_ITEMS_INTERVAL_MS = 2_100; // API advertises 0.5 requests/second
const runningAccounts = new Set<string>();
const marketplaceById = new Map(Object.entries(MARKETPLACE_IDS).map(([code, id]) => [id, code]));

function amount(value?: { Amount?: string }): string {
  return String(Number(value?.Amount ?? 0));
}

/** Convert one Orders API order into the report-shaped rows used by the idempotent importer. */
export function mapLiveOrderRows(order: SpApiOrder, items: SpApiOrderItem[]): Record<string, string>[] {
  const marketplace = marketplaceById.get(order.MarketplaceId ?? "")
    ?? SALES_CHANNEL_TO_MARKETPLACE[order.SalesChannel ?? ""]
    ?? "IT";
  const currency = order.OrderTotal?.CurrencyCode
    ?? items.find((item) => item.ItemPrice?.CurrencyCode)?.ItemPrice?.CurrencyCode
    ?? "EUR";
  const base = {
    "amazon-order-id": order.AmazonOrderId,
    "purchase-date": order.PurchaseDate ?? new Date().toISOString(),
    "last-updated-date": order.LastUpdateDate ?? order.PurchaseDate ?? new Date().toISOString(),
    "order-status": order.OrderStatus ?? "Pending",
    "sales-channel": order.SalesChannel ?? `Amazon.${marketplace.toLowerCase()}`,
    "fulfillment-channel": order.FulfillmentChannel === "MFN" ? "Merchant" : "Amazon",
    "ship-country": order.ShippingAddress?.CountryCode ?? "",
    currency,
    "is-business-order": String(order.IsBusinessOrder ?? false),
  };

  if (items.length === 0) return [base];
  return items.map((item) => ({
    ...base,
    asin: item.ASIN ?? "",
    sku: item.SellerSKU ?? "",
    "product-name": item.Title ?? "Unknown",
    quantity: String(item.QuantityOrdered ?? 1),
    "quantity-shipped": String(item.QuantityShipped ?? 0),
    "item-price": amount(item.ItemPrice),
    "item-tax": amount(item.ItemTax),
    "item-promotion-discount": amount(item.PromotionDiscount),
  }));
}

function stateMap(states: AmazonOrderSyncState[]): Map<string, AmazonOrderSyncState> {
  return new Map(states.map((state) => [state.amazonOrderId, state]));
}

function needsRefresh(order: SpApiOrder, state?: AmazonOrderSyncState): boolean {
  if (!state || state.itemCount === 0) return true;
  const remoteUpdatedAt = Date.parse(order.LastUpdateDate ?? order.PurchaseDate ?? "");
  return Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt > state.lastUpdatedDate.getTime();
}

async function syncRegion(region: SpRegion, createdAfter: Date): Promise<IngestStats> {
  const marketplaceIds = region === "NA" ? ALL_NA_MARKETPLACE_IDS : ALL_EU_MARKETPLACE_IDS;
  const orders = await fetchOrdersCreatedSince(marketplaceIds, createdAfter, region);
  const ids = orders.map((order) => order.AmazonOrderId);
  const initialStates = stateMap(await findAmazonOrderSyncStates(prisma, ids));
  const candidates = orders.filter((order) => needsRefresh(order, initialStates.get(order.AmazonOrderId)));
  const itemsByOrder = new Map<string, SpApiOrderItem[]>();

  for (const [index, order] of candidates.entries()) {
    try {
      itemsByOrder.set(order.AmazonOrderId, await fetchOrderItems(order.AmazonOrderId, region));
    } catch (error) {
      console.warn(`[Amazon Live Orders] ${region} items failed for ${order.AmazonOrderId}:`, error);
      itemsByOrder.set(order.AmazonOrderId, []);
    }
    if (index < candidates.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ORDER_ITEMS_INTERVAL_MS));
    }
  }

  // A report may have completed while item calls were in flight. Re-check so
  // provisional API amounts never overwrite a newly reconciled report row.
  const latestStates = stateMap(await findAmazonOrderSyncStates(prisma, candidates.map((order) => order.AmazonOrderId)));
  const rows = candidates
    .filter((order) => needsRefresh(order, latestStates.get(order.AmazonOrderId)))
    .flatMap((order) => mapLiveOrderRows(order, itemsByOrder.get(order.AmazonOrderId) ?? []));
  return ingestOrderRows(rows);
}

/** Near-real-time order detail sync, independent from slow flat-file reports. */
export async function runAmazonLiveOrdersSync(): Promise<void> {
  const accountId = getCurrentAccountId();
  if (runningAccounts.has(accountId)) {
    console.log(`[Amazon Live Orders] Sync still running for account ${accountId} — skipping overlapping tick`);
    return;
  }

  runningAccounts.add(accountId);
  try {
    const createdAfter = new Date(italyDayStart(new Date()).getTime() - DAY_MS);
    const totals: IngestStats = { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 };
    const regions: SpRegion[] = await hasNACredentials() ? ["EU", "NA"] : ["EU"];
    for (const region of regions) {
      const stats = await syncRegion(region, createdAfter);
      totals.recordsIn += stats.recordsIn;
      totals.recordsImported += stats.recordsImported;
      totals.recordsUpdated += stats.recordsUpdated;
      totals.recordsRejected += stats.recordsRejected;
    }
    if (totals.recordsImported > 0 || totals.recordsUpdated > 0) {
      console.log(`[Amazon Live Orders] Imported ${totals.recordsImported}, updated ${totals.recordsUpdated}`);
      broadcast("amazon:sync", { source: "orders_api", ...totals, ts: new Date().toISOString() });
    }
  } finally {
    runningAccounts.delete(accountId);
  }
}
