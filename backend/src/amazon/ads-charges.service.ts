// amazon/ads-charges.service.ts — Sync Sponsored Ads invoice charges from the
// SP-API Finances API. They mark the start of each PPC threshold-billing cycle
// days before the settlement report that contains them is closed.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { fetchProductAdsPaymentEvents } from "./sp-api.service";
import {
  upsertAdsPaymentEvents,
  PPC_BILLING_MARKETPLACE,
  type AdsPaymentEventInput,
} from "../repositories/amazon/ppc-cycle.repo";
import {
  createSyncJob,
  findLatestCompletedSyncJobEnd,
  finishSyncJob,
} from "../repositories/amazon/sync-jobs.repo";

const JOB_TYPE = "ads_charges";
const DAY_MS = 86_400_000;
/** First sync: enough history for the cycle ledger (see ppc-cycle.repo.ts). */
const INITIAL_LOOKBACK_DAYS = 90;
/** Financial events can surface up to ~48h after posting: re-read a margin. */
const RESYNC_OVERLAP_DAYS = 3;

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readMoney(value: unknown): { amount: number; currency: string } | null {
  if (!isRecord(value)) return null;
  const amount = Number(value.CurrencyAmount);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: typeof value.CurrencyCode === "string" ? value.CurrencyCode : "EUR" };
}

/** Validates one raw ProductAdsPaymentEvent; returns null when it is unusable. */
export function parseProductAdsPaymentEvent(raw: unknown): AdsPaymentEventInput | null {
  if (!isRecord(raw)) return null;
  const { invoiceId, transactionType } = raw;
  const postedDate = new Date(String(raw.postedDate));
  const base = readMoney(raw.baseValue);
  const total = readMoney(raw.transactionValue);
  if (typeof invoiceId !== "string" || invoiceId === "") return null;
  if (typeof transactionType !== "string" || Number.isNaN(postedDate.getTime())) return null;
  if (!base || !total) return null;

  return {
    invoiceId,
    transactionType: transactionType.toLowerCase(),
    postedDate,
    baseValue: base.amount,
    taxValue: readMoney(raw.taxValue)?.amount ?? 0,
    transactionValue: total.amount,
    currency: total.currency,
    rawPayload: raw as Prisma.InputJsonValue,
  };
}

function parseEvents(raw: unknown[]): AdsPaymentEventInput[] {
  const events = raw
    .map(parseProductAdsPaymentEvent)
    .filter((event): event is AdsPaymentEventInput => event !== null);
  if (events.length < raw.length) {
    console.warn(`[Ads Charges] Skipped ${raw.length - events.length} malformed ads payment events`);
  }
  return events;
}

/**
 * Pulls and stores the current account's ads charges, resuming from the last
 * successful run (tracked as an AmazonSyncJob). Returns how many were stored.
 */
export async function syncAdsPaymentEvents(now = new Date()): Promise<number> {
  const lastEnd = await findLatestCompletedSyncJobEnd(prisma, JOB_TYPE);
  const postedAfter = lastEnd
    ? new Date(lastEnd.getTime() - RESYNC_OVERLAP_DAYS * DAY_MS)
    : new Date(now.getTime() - INITIAL_LOOKBACK_DAYS * DAY_MS);
  const jobId = await createSyncJob(prisma, {
    jobType: JOB_TYPE,
    marketplace: PPC_BILLING_MARKETPLACE,
    dateFrom: postedAfter,
    dateTo: now,
  });

  try {
    const raw = await fetchProductAdsPaymentEvents(postedAfter);
    const events = parseEvents(raw);
    const stored = await upsertAdsPaymentEvents(prisma, events);
    await finishSyncJob(prisma, jobId, {
      recordsIn: raw.length,
      recordsImported: stored,
      recordsUpdated: 0,
      recordsRejected: raw.length - events.length,
    });
    return stored;
  } catch (err) {
    await finishSyncJob(
      prisma, jobId, { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, String(err),
    );
    throw err;
  }
}
