// amazon/ingest.service.ts — TSV parser + AmazonOrder/AmazonOrderItem bulk upserts
// Optimized: batch SQL INSERT ... ON CONFLICT for 10-50x speedup vs individual upserts

import { prisma } from "../db";
import { SALES_CHANNEL_TO_MARKETPLACE } from "./config";
import { getCurrentAccountId } from "../context/account-context";

export interface IngestStats {
  recordsIn: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsRejected: number;
}

/** Parse a TSV string into an array of objects keyed by header columns */
export function parseTsv(raw: string): Record<string, string>[] {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

/**
 * Column name resolver — handles both possible naming conventions from Amazon reports.
 * GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL uses:
 *   product-name, quantity, ship-country, item-promotion-discount, fulfillment-channel
 * (no order-item-id — we derive a composite key from order+asin+sku)
 */
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

/** Escape a string for safe embedding in SQL literals */
function esc(s: string | null | undefined): string {
  if (s == null) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

function escDate(s: string | null | undefined): string {
  if (!s) return "NULL";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "NULL";
  return `'${d.toISOString()}'::timestamptz`;
}

function escFloat(s: string | number | null | undefined): string {
  const n = parseFloat(String(s ?? "0"));
  return isNaN(n) ? "0" : String(n);
}

function escBool(s: string): string {
  return s.toLowerCase() === "true" ? "true" : "false";
}

/**
 * Bulk upsert AmazonOrder + AmazonOrderItem using raw SQL batch INSERT ON CONFLICT.
 * Processes rows in batches of BATCH_SIZE to avoid oversized SQL statements.
 */
const BATCH_SIZE = 200;

interface OrderRecord {
  amazonOrderId: string;
  purchaseDate: string;
  lastUpdatedDate: string;
  orderStatus: string;
  salesChannel: string;
  marketplace: string;
  fulfillmentChannel: string;
  shipCountry: string | null;
  currency: string;
  itemTotal: number;
  isBusinessOrder: boolean;
}

interface ItemRecord {
  orderItemId: string;
  amazonOrderId: string;
  asin: string;
  sku: string | null;
  productTitle: string;
  quantityOrdered: number;
  quantityShipped: number;
  itemPrice: number;
  itemTax: number;
  promotionDiscount: number;
  currency: string;
  marketplace: string;
  purchaseDate: string;
}

async function bulkUpsertOrders(orders: OrderRecord[]): Promise<{ imported: number; updated: number }> {
  if (orders.length === 0) return { imported: 0, updated: 0 };

  const amazonAccountId = getCurrentAccountId();

  // Find which orders already exist (for stats), scoped to the current account
  const ids = orders.map(o => `'${o.amazonOrderId.replace(/'/g, "''")}'`).join(",");
  const existing = await prisma.$queryRawUnsafe<{ amazonorderid: string }[]>(
    `SELECT "amazonOrderId" AS amazonorderid FROM "AmazonOrder" WHERE "amazonOrderId" IN (${ids}) AND "amazonAccountId" = ${esc(amazonAccountId)}`
  );
  const existingSet = new Set(existing.map(r => r.amazonorderid));

  // Build batch INSERT ON CONFLICT — include id as gen_random_uuid() for new rows
  // (Prisma's @default(cuid()) is app-level; DB has no default, so we must supply it)
  const values = orders.map(o => `(
    gen_random_uuid()::text,
    ${esc(amazonAccountId)},
    ${esc(o.amazonOrderId)},
    ${escDate(o.purchaseDate)},
    ${escDate(o.lastUpdatedDate)},
    ${esc(o.orderStatus)},
    ${esc(o.salesChannel)},
    ${esc(o.marketplace)},
    ${esc(o.fulfillmentChannel)},
    ${o.shipCountry == null ? "NULL" : esc(o.shipCountry)},
    ${esc(o.currency)},
    ${o.itemTotal},
    ${o.isBusinessOrder},
    NOW(),
    NOW()
  )`).join(",\n");

  await prisma.$executeRawUnsafe(`
    INSERT INTO "AmazonOrder" (
      "id", "amazonAccountId", "amazonOrderId", "purchaseDate", "lastUpdatedDate", "orderStatus",
      "salesChannel", "marketplace", "fulfillmentChannel", "shipCountry",
      "currency", "itemTotal", "isBusinessOrder", "syncedAt", "updatedAt"
    ) VALUES ${values}
    ON CONFLICT ("amazonAccountId", "amazonOrderId") DO UPDATE SET
      "lastUpdatedDate"    = EXCLUDED."lastUpdatedDate",
      "orderStatus"        = EXCLUDED."orderStatus",
      "itemTotal"          = EXCLUDED."itemTotal",
      "fulfillmentChannel" = EXCLUDED."fulfillmentChannel",
      "updatedAt"          = NOW()
  `);

  const imported = orders.filter(o => !existingSet.has(o.amazonOrderId)).length;
  const updated  = orders.length - imported;
  return { imported, updated };
}

async function bulkUpsertItems(items: ItemRecord[]): Promise<void> {
  if (items.length === 0) return;

  const amazonAccountId = getCurrentAccountId();

  const values = items.map(i => `(
    gen_random_uuid()::text,
    ${esc(amazonAccountId)},
    ${esc(i.orderItemId)},
    ${esc(i.amazonOrderId)},
    ${esc(i.asin)},
    ${i.sku == null ? "NULL" : esc(i.sku)},
    ${esc(i.productTitle)},
    ${i.quantityOrdered},
    ${i.quantityShipped},
    ${i.itemPrice},
    ${i.itemTax},
    ${i.promotionDiscount},
    ${esc(i.currency)},
    ${esc(i.marketplace)},
    ${escDate(i.purchaseDate)}
  )`).join(",\n");

  await prisma.$executeRawUnsafe(`
    INSERT INTO "AmazonOrderItem" (
      "id", "amazonAccountId", "orderItemId", "amazonOrderId", "asin", "sku", "productTitle",
      "quantityOrdered", "quantityShipped", "itemPrice", "itemTax",
      "promotionDiscount", "currency", "marketplace", "purchaseDate"
    ) VALUES ${values}
    ON CONFLICT ("amazonAccountId", "orderItemId") DO UPDATE SET
      "quantityShipped"    = EXCLUDED."quantityShipped",
      "itemPrice"          = EXCLUDED."itemPrice",
      "itemTax"            = EXCLUDED."itemTax",
      "promotionDiscount"  = EXCLUDED."promotionDiscount",
      "productTitle"       = EXCLUDED."productTitle"
  `);
}

/** Group TSV rows by amazon-order-id, build AmazonOrder + AmazonOrderItem, bulk upsert */
export async function ingestOrderRows(
  rows: Record<string, string>[]
): Promise<IngestStats> {
  const stats: IngestStats = { recordsIn: rows.length, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 };

  // Group by order ID
  const orderMap = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const orderId = col(row, "amazon-order-id", "order-id");
    if (!orderId) { stats.recordsRejected++; continue; }
    if (!orderMap.has(orderId)) orderMap.set(orderId, []);
    orderMap.get(orderId)!.push(row);
  }

  const orderBatch: OrderRecord[] = [];
  const itemBatch: ItemRecord[]   = [];

  const flushBatch = async () => {
    if (orderBatch.length === 0) return;
    const { imported, updated } = await bulkUpsertOrders(orderBatch);
    stats.recordsImported += imported;
    stats.recordsUpdated  += updated;
    orderBatch.length = 0;

    await bulkUpsertItems(itemBatch);
    itemBatch.length = 0;
  };

  for (const [amazonOrderId, items] of orderMap) {
    const first = items[0];

    try {
      const salesChannel = col(first, "sales-channel") || "Amazon.it";
      // Skip Non-Amazon / inventory adjustment records
      if (salesChannel === "Non-Amazon" || !salesChannel.toLowerCase().startsWith("amazon")) {
        stats.recordsRejected++;
        continue;
      }
      const marketplace = SALES_CHANNEL_TO_MARKETPLACE[salesChannel] ?? "IT";

      const purchaseDateStr  = col(first, "purchase-date", "order-date");
      const lastUpdatedStr   = col(first, "last-updated-date", "purchase-date");
      const orderStatus      = col(first, "order-status") || "Shipped";
      const fulfillmentRaw   = col(first, "fulfillment-channel", "fulfilled-by");
      const fulfillmentChannel = fulfillmentRaw.toLowerCase().includes("merchant") ? "MFN" : "AFN";
      const isBusinessOrder  = col(first, "is-business-order").toLowerCase() === "true";
      const shipCountry      = col(first, "ship-country", "ship-address-country") || null;
      const currency         = col(first, "currency") || "EUR";

      // Deduplicate items by composite key (order+asin+sku)
      const itemDedup = new Map<string, Record<string, string>>();
      for (const item of items) {
        const asin = col(item, "asin", "ASIN");
        const sku  = col(item, "sku", "seller-sku") || null;
        if (asin) itemDedup.set(`${amazonOrderId}::${asin}::${sku ?? "nosku"}`, item);
      }

      let itemTotal = 0;
      for (const item of itemDedup.values()) {
        const p = parseFloat(col(item, "item-price") || "0");
        if (!isNaN(p)) itemTotal += p;
      }

      orderBatch.push({
        amazonOrderId,
        purchaseDate:      purchaseDateStr || new Date().toISOString(),
        lastUpdatedDate:   lastUpdatedStr  || purchaseDateStr || new Date().toISOString(),
        orderStatus,
        salesChannel,
        marketplace,
        fulfillmentChannel,
        shipCountry,
        currency,
        itemTotal,
        isBusinessOrder,
      });

      for (const item of itemDedup.values()) {
        const asin = col(item, "asin", "ASIN");
        if (!asin) { stats.recordsRejected++; continue; }

        const sku          = col(item, "sku", "seller-sku") || null;
        const productTitle = col(item, "product-name", "item-title", "item-name") || "Unknown";
        const orderItemId  = `${amazonOrderId}::${asin}::${sku ?? "nosku"}`;

        itemBatch.push({
          orderItemId,
          amazonOrderId,
          asin,
          sku,
          productTitle,
          quantityOrdered:   parseInt(col(item, "quantity", "quantity-purchased") || "1", 10),
          quantityShipped:   parseInt(col(item, "quantity-shipped") || "0", 10),
          itemPrice:         parseFloat(col(item, "item-price")  || "0") || 0,
          itemTax:           parseFloat(col(item, "item-tax")    || "0") || 0,
          promotionDiscount: parseFloat(col(item, "item-promotion-discount", "promotion-discount", "ship-promotion-discount") || "0") || 0,
          currency,
          marketplace,
          purchaseDate: purchaseDateStr || new Date().toISOString(),
        });
      }

      // Flush every BATCH_SIZE orders
      if (orderBatch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    } catch (err) {
      console.error(`[Ingest] Failed order ${amazonOrderId}:`, err);
      stats.recordsRejected++;
    }
  }

  // Final flush
  await flushBatch();

  return stats;
}
