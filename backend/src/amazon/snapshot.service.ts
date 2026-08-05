// amazon/snapshot.service.ts — Aggregate AmazonOrderItem → AmazonProductSnapshot
// All dates use the ITALIAN civil calendar (Europe/Rome, UTC+1 winter / UTC+2 summer DST).
// An order placed at 00:30 Italian time on Apr 23 belongs to the Apr 23 snapshot even
// though its UTC timestamp is Apr 22 22:30 (UTC+2). The helpers below ensure this.

import { prisma } from "../db";
import {
  groupAmazonItemsForSnapshot,
  findRepresentativeItem,
  countDistinctOrdersForSnapshot,
} from "../repositories/amazon/orders.repo";
import { upsertAmazonProductSnapshot } from "../repositories/amazon/product-snapshots.repo";

// ─── Italy timezone helpers ───────────────────────────────────────────────────

/** Italy UTC offset in hours. DST: last Sunday March → last Sunday October = UTC+2, else UTC+1. */
function italyOffsetHours(refDate?: Date): number {
  const d = refDate ?? new Date();
  // Use the month of the Italy-adjusted date to determine DST
  // Rough approximation: months 4-10 (April-October) inclusive = UTC+2
  const utcMonth = d.getUTCMonth() + 1; // 1-12
  return utcMonth >= 4 && utcMonth <= 10 ? 2 : 1;
}

/**
 * Convert a UTC Date to its Italy calendar date string "YYYY-MM-DD".
 * e.g., 2026-04-22T23:30:00Z (UTC) → "2026-04-23" (Italy, UTC+2)
 */
function utcToItalyDateStr(utcDate: Date): string {
  const offsetMs = italyOffsetHours(utcDate) * 3600_000;
  return new Date(utcDate.getTime() + offsetMs).toISOString().split("T")[0];
}

/**
 * Return the UTC start and end timestamps that exactly cover one Italian calendar day.
 * Example (summer, UTC+2): "2026-04-23" → { start: 2026-04-22T22:00:00Z, end: 2026-04-23T21:59:59.999Z }
 */
function italyDayBoundsUtc(italyDateStr: string): { start: Date; end: Date } {
  // Parse the Italian date
  const [y, m, d] = italyDateStr.split("-").map(Number);
  // Determine offset for this date (approximate DST)
  const offsetH = m >= 4 && m <= 10 ? 2 : 1;
  // UTC start = midnight Italy = midnight UTC minus offset
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetH * 3_600_000;
  return {
    start: new Date(startMs),
    end:   new Date(startMs + 86_400_000 - 1),
  };
}

/**
 * Return an Italian calendar date string for N days ago (relative to today in Italy time).
 * dayOffset = 0 → today (Italy), 1 → yesterday (Italy), etc.
 */
function italyDateStrOffset(dayOffset: number): string {
  const now = new Date();
  const offsetMs = italyOffsetHours(now) * 3_600_000;
  const italyNow = new Date(now.getTime() + offsetMs);
  const target   = new Date(italyNow);
  target.setDate(target.getUTCDate() - dayOffset);
  return target.toISOString().split("T")[0];
}

// ─── Core snapshot computation ────────────────────────────────────────────────

/**
 * Compute daily product snapshots for a given Italian calendar date (string "YYYY-MM-DD").
 * Queries AmazonOrderItem using the correct UTC window for that Italian day.
 * Upserts one AmazonProductSnapshot row per (asin, marketplace).
 * Returns the number of product rows written.
 */
export async function computeAmazonDailySnapshot(italyDateStr: string): Promise<number> {
  const { start, end } = italyDayBoundsUtc(italyDateStr);

  // Snapshot date stored as the Italian calendar date (midnight UTC of that date string)
  const snapshotDate = new Date(`${italyDateStr}T00:00:00.000Z`);

  const groups = await groupAmazonItemsForSnapshot(prisma, { from: start, to: end });

  let count = 0;

  for (const group of groups) {
    // Representative product info (latest item in the day)
    const sample = await findRepresentativeItem(prisma, {
      asin:        group.asin,
      marketplace: group.marketplace,
      from:        start,
      to:          end,
    });

    if (!sample) continue;

    // Distinct orders for this product on this day
    const distinctOrders = await countDistinctOrdersForSnapshot(prisma, {
      asin: group.asin,
      marketplace: group.marketplace,
      from: start,
      to: end,
    });

    const unitsSold    = group._sum.quantityOrdered ?? 0;
    const grossRevenue = group._sum.itemPrice ?? 0;
    const orderCount   = distinctOrders;

    await upsertAmazonProductSnapshot(prisma, {
      snapshotDate,
      asin:         group.asin,
      sku:          sample.sku,
      productTitle: sample.productTitle,
      marketplace:  group.marketplace,
      unitsSold,
      grossRevenue,
      netRevenue:   grossRevenue,
      orderCount,
    });

    count++;
  }

  return count;
}

/** Compute snapshots for yesterday and today (Italian calendar). Runs every hour. */
export async function runAmazonSnapshotJob(): Promise<void> {
  const today     = italyDateStrOffset(0);
  const yesterday = italyDateStrOffset(1);

  console.log(`[Amazon Snapshot] Computing ${yesterday} + ${today} (Italy dates)...`);
  const [y, t] = await Promise.all([
    computeAmazonDailySnapshot(yesterday),
    computeAmazonDailySnapshot(today),
  ]);
  console.log(`[Amazon Snapshot] Done. Yesterday: ${y} products, Today: ${t} products`);
}

/**
 * Compute full historical snapshots for N days back from today (Italian calendar).
 * Default: 180 days. Iterates oldest → newest so partial runs leave the most
 * recent data intact if interrupted.
 */
export async function computeAllAmazonHistoricalSnapshots(days = 180): Promise<void> {
  console.log(`[Amazon Snapshot] Starting full historical computation (${days} days, Italy timezone)...`);
  let total = 0;
  let processed = 0;
  const errors: string[] = [];

  // Build list of Italian date strings from (today - days) to today
  const dateList: string[] = [];
  for (let i = days; i >= 0; i--) {
    dateList.push(italyDateStrOffset(i));
  }

  for (const dateStr of dateList) {
    try {
      const count = await computeAmazonDailySnapshot(dateStr);
      total += count;
      processed++;
      if (processed % 30 === 0) {
        console.log(`[Amazon Snapshot] Progress: ${processed}/${dateList.length} days processed, ${total} total snapshots`);
      }
    } catch (err) {
      const msg = `[Amazon Snapshot] Error on ${dateStr}: ${String(err).slice(0, 100)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  console.log(`[Amazon Snapshot] Historical computation complete: ${processed} days, ${total} snapshots, ${errors.length} errors`);
}

/**
 * Compute snapshots for a custom date range (Italian calendar strings "YYYY-MM-DD").
 * Used by the API endpoint for targeted re-computation.
 */
export async function computeSnapshotRange(fromDate: string, toDate: string): Promise<number> {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to   = new Date(`${toDate}T00:00:00.000Z`);
  let total  = 0;
  const current = new Date(from);

  while (current <= to) {
    const dateStr = current.toISOString().split("T")[0];
    total += await computeAmazonDailySnapshot(dateStr);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return total;
}
