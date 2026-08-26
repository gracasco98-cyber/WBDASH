// health.ts — Reconciliation check: finds Mirakl orders that should have
// synced into Shopify/WBDASH by now but haven't, so a stuck order surfaces
// as a visible dashboard warning instead of going unnoticed for hours (as
// happened in production on 2026-08-24 and 2026-08-25 — an order stayed
// stuck for ~1h30 before anyone caught it).
//
// Deliberately independent of runMiraklSync()/fetchNewOrders(): this must
// keep working even if the live sync itself is the thing that's broken (e.g.
// a state genuinely nobody has mapped yet), so it queries Mirakl by date
// only (fetchOrderSummariesSince — no order_state_codes filter, no mapOrder())
// and classifies every order itself against the same MIRAKL_SAFE_ORDER_STATES/
// MIRAKL_IGNORED_ORDER_STATES vocabulary.
import { prisma } from "../db";
import {
  fetchOrderSummariesSince,
  MIRAKL_SAFE_ORDER_STATES,
  MIRAKL_IGNORED_ORDER_STATES,
  type MiraklOrderSummary,
} from "./client";
import { findByMiraklOrderId } from "../repositories/mirakl/orders.repo";

export interface StuckMiraklOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  ageHours: number;
  /** "unsynced": a known-safe state that just hasn't made it to Shopify yet
   *  (e.g. a malformed order stuck retrying, like the null-address case).
   *  "unrecognized": a state outside both the safe and the ignored lists —
   *  possibly one Mirakl has never sent before. */
  reason: "unsynced" | "unrecognized";
}

const LOOKBACK_DAYS = 3;
const STALE_AFTER_HOURS = 2;

function classify(order: MiraklOrderSummary): StuckMiraklOrder["reason"] | null {
  if ((MIRAKL_IGNORED_ORDER_STATES as readonly string[]).includes(order.orderState)) return null;
  if ((MIRAKL_SAFE_ORDER_STATES as readonly string[]).includes(order.orderState)) return "unsynced";
  return "unrecognized";
}

export async function findStuckMiraklOrders(
  lookbackDays = LOOKBACK_DAYS,
  staleAfterHours = STALE_AFTER_HOURS
): Promise<StuckMiraklOrder[]> {
  const summaries = await fetchOrderSummariesSince(lookbackDays);
  const now = Date.now();
  const stuck: StuckMiraklOrder[] = [];

  for (const order of summaries) {
    const alreadySynced = await findByMiraklOrderId(prisma, order.orderId);
    if (alreadySynced) continue;

    const reason = classify(order);
    if (!reason) continue; // stato ignorato di proposito (mai da sincronizzare)

    const ageHours = (now - new Date(order.createdDate).getTime()) / 3_600_000;
    if (ageHours < staleAfterHours) continue; // ancora dentro il normale ritardo di sync

    stuck.push({ orderId: order.orderId, orderState: order.orderState, createdDate: order.createdDate, ageHours, reason });
  }

  return stuck;
}
