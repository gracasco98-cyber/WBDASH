// amazon/settlement.service.ts — Fetch and parse Amazon settlement reports (fees, refunds)

import { prisma } from "../db";
import { getSpApiToken, invalidateTokens } from "./token.service";
import { EU_ENDPOINT } from "./config";
import * as zlib from "zlib";
import { promisify } from "util";
import {
  upsertAmazonSettlement,
  deleteSettlementTransactions,
  createSettlementTransactions,
  findTransactionsForOrders,
} from "../repositories/amazon/settlement.repo";
const gunzip = promisify(zlib.gunzip);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let _settlementSyncing = false; // prevent concurrent syncs

// ─── Settlement report column helpers ─────────────────────────────────────────
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k] !== undefined) return row[k].trim();
  return "";
}

function parseTsv(raw: string): Record<string, string>[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

async function spRequest(path: string): Promise<any> {
  const token = await getSpApiToken();
  const res = await fetch(`${EU_ENDPOINT}${path}`, {
    headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
  });
  if (res.status === 401) { invalidateTokens(); throw new Error("[Settlement] 401"); }
  if (!res.ok) { const t = await res.text(); throw new Error(`[Settlement] ${path} → ${res.status}: ${t}`); }
  return res.json();
}

const MARKETPLACE_NAME_MAP: Record<string, string> = {
  "amazon.it": "IT", "amazon.de": "DE", "amazon.fr": "FR", "amazon.es": "ES",
  "amazon.co.uk": "UK", "amazon.nl": "NL", "amazon.pl": "PL", "amazon.se": "SE",
  "amazon.be": "BE", "amazon.tr": "TR",
};

function mpFromName(name: string): string {
  const n = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(MARKETPLACE_NAME_MAP)) {
    if (n.includes(k)) return v;
  }
  return "EU";
}

// ─── Fetch list of available settlement reports (paginated, up to 6 months) ────
export async function listSettlementReports(): Promise<string[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  // Use literal ISO string (no URLSearchParams encoding of colons)
  const createdSince = sixMonthsAgo.toISOString().replace(/\.\d+Z$/, "Z"); // trim ms

  const reportIds: string[] = [];
  let nextToken: string | undefined;

  try {
    do {
      // Build URL manually to avoid double-encoding of colons in date
      let url = `/reports/2021-06-30/reports?reportTypes=GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE&processingStatuses=DONE&pageSize=100&createdSince=${encodeURIComponent(createdSince)}`;
      if (nextToken) url += `&nextToken=${encodeURIComponent(nextToken)}`;

      const json = await spRequest(url);
      const reports = json.reports ?? [];
      for (const r of reports) reportIds.push(r.reportId);
      nextToken = json.nextToken;

      if (nextToken) {
        console.log(`[Settlement] Paginating — ${reportIds.length} reports so far, fetching next page...`);
        await sleep(1000);
      }
    } while (nextToken);

    console.log(`[Settlement] Found ${reportIds.length} settlement reports (last 6 months)`);
    return reportIds;
  } catch (err: any) {
    // Fallback: try without createdSince if Amazon doesn't support it
    const errStr = String(err?.message ?? err);
    if (errStr.includes("400")) {
      console.warn("[Settlement] createdSince filter failed (400) — retrying without date filter");
      try {
        let url2 = `/reports/2021-06-30/reports?reportTypes=GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE&processingStatuses=DONE&pageSize=100`;
        const json2 = await spRequest(url2);
        const ids = (json2.reports ?? []).map((r: any) => r.reportId);
        console.log(`[Settlement] Found ${ids.length} settlement reports (no date filter)`);
        return ids;
      } catch (e2) {
        console.error("[Settlement] listSettlementReports fallback failed:", e2);
        return [];
      }
    }
    console.error("[Settlement] listSettlementReports failed:", err);
    return [];
  }
}

// ─── Download and parse one settlement report (with retry on 429) ─────────────
export async function downloadSettlementReport(reportId: string): Promise<string> {
  const docJson = await spRequest(`/reports/2021-06-30/reports/${reportId}`);
  const docId: string = docJson.reportDocumentId;
  if (!docId) throw new Error(`[Settlement] No documentId for report ${reportId}`);

  // Retry document metadata fetch (429 rate-limit resilient)
  let dlJson: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      dlJson = await spRequest(`/reports/2021-06-30/documents/${docId}`);
      break;
    } catch (e: any) {
      const is429 = String(e?.message ?? "").includes("429");
      if (!is429 || attempt === 3) throw e;
      const waitMs = (attempt + 1) * 30_000; // 30s, 60s, 90s
      console.log(`[Settlement] 429 on document fetch, waiting ${waitMs / 1000}s before retry ${attempt + 2}/4`);
      await sleep(waitMs);
    }
  }

  const url: string = dlJson.url;
  const compression: string | undefined = dlJson.compressionAlgorithm;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`[Settlement] Download failed: ${res.status}`);

  if (compression === "GZIP") {
    const buf = Buffer.from(await res.arrayBuffer());
    return (await gunzip(buf)).toString("utf-8");
  }
  return res.text();
}

// ─── Ingest settlement rows into DB ───────────────────────────────────────────
// Extracts settlement header (totalAmount, dates) AND all transaction rows.
// Captures ALL amount columns: price, item-fee, shipment-fee, order-fee, misc-fee,
// direct-payment, other-fee, other-amount — so ServiceFee/Advertising rows are included.
export async function ingestSettlementRows(
  rows: Record<string, string>[],
  fallbackSettlementId: string
): Promise<{ settlementId: string; upserted: number; skipped: number; totalAmount: number }> {

  // ── Extract settlement header from the first row that has settlement-id ────
  let headerSettlementId = fallbackSettlementId;
  let headerTotalAmount = 0;
  let headerStartDate: Date | null = null;
  let headerEndDate: Date | null = null;
  let headerDepositDate: Date | null = null;
  let headerCurrency = "EUR";
  let headerMarketplace = "EU";

  for (const row of rows) {
    const sid = col(row, "settlement-id");
    if (sid) {
      headerSettlementId = sid;
      const ta = col(row, "total-amount");
      if (ta) headerTotalAmount = parseFloat(ta.replace(",", ".")) || 0;
      const sd = col(row, "settlement-start-date");
      const ed = col(row, "settlement-end-date");
      const dd = col(row, "deposit-date");
      if (sd) headerStartDate = new Date(sd);
      if (ed) headerEndDate   = new Date(ed);
      if (dd) headerDepositDate = new Date(dd);
      const cur = col(row, "currency");
      if (cur) headerCurrency = cur;
      const mp = col(row, "marketplace-name");
      if (mp) headerMarketplace = mpFromName(mp);
      break;
    }
  }

  const settlementId = headerSettlementId;

  // Map key → aggregated entry
  // Key = "orderId|asin|amountType|transactionType|marketplace"
  const agg = new Map<string, {
    settlementId: string; transactionType: string;
    orderId: string | null; asin: string | null; sku: string | null;
    marketplace: string; amountType: string; amount: number;
    currency: string; postedDate: Date; quantityPurchased: number | null;
  }>();

  let skipped = 0;

  for (const row of rows) {
    // Skip the settlement header row itself (no transaction-type content, just summary)
    const transactionType = col(row, "transaction-type");
    const marketplaceName = col(row, "marketplace-name");
    const marketplace = marketplaceName ? mpFromName(marketplaceName) : "EU";
    const currency    = col(row, "currency") || "EUR";
    const postedDateStr = col(row, "posted-date", "posted-date-time");
    const postedDate  = postedDateStr ? new Date(postedDateStr) : new Date();
    const orderId     = col(row, "order-id", "adjustment-id") || null;
    const asin        = col(row, "asin") || null;
    const sku         = col(row, "sku") || null;
    const qtyStr      = col(row, "quantity-purchased");
    const quantityPurchased = qtyStr ? parseInt(qtyStr, 10) || null : null;

    // ── Collect ALL possible amount columns from Amazon settlement TSV ────────
    // Amazon uses multiple columns depending on fee type:
    //   price-type / price-amount           → Order principal, tax, shipping, etc.
    //   item-related-fee-type / amount      → Commission, FBA fee, etc.
    //   promotion-type / promotion-amount   → Promotions
    //   shipment-fee-type / amount          → Shipment fees
    //   order-fee-type / order-fee-amount   → Advertising, account fees (ServiceFee rows)
    //   misc-fee-amount                     → Storage, miscellaneous fees
    //   other-fee-amount + reason           → Other fees with description
    //   direct-payment-type / amount        → Direct payment charges
    //   other-amount                        → Catch-all for remaining amounts

    const entries: Array<{ amountType: string; amount: number }> = [];

    const priceType       = col(row, "price-type");
    const priceAmount     = parseFloat(col(row, "price-amount") || "0") || 0;
    if (priceType && priceAmount !== 0) entries.push({ amountType: priceType, amount: priceAmount });

    const feeType         = col(row, "item-related-fee-type");
    const feeAmount       = parseFloat(col(row, "item-related-fee-amount") || "0") || 0;
    if (feeType && feeAmount !== 0) entries.push({ amountType: feeType, amount: feeAmount });

    const promoType       = col(row, "promotion-type");
    const promoAmount     = parseFloat(col(row, "promotion-amount") || "0") || 0;
    if (promoType && promoAmount !== 0) entries.push({ amountType: promoType, amount: promoAmount });

    const shipFeeType     = col(row, "shipment-fee-type");
    const shipFeeAmount   = parseFloat(col(row, "shipment-fee-amount") || "0") || 0;
    if (shipFeeType && shipFeeAmount !== 0) entries.push({ amountType: shipFeeType, amount: shipFeeAmount });

    // ── ORDER-FEE: Used for advertising charges and account-level fees ────────
    const orderFeeType   = col(row, "order-fee-type");
    const orderFeeAmount = parseFloat(col(row, "order-fee-amount") || "0") || 0;
    if (orderFeeType && orderFeeAmount !== 0) entries.push({ amountType: orderFeeType, amount: orderFeeAmount });
    else if (!orderFeeType && orderFeeAmount !== 0) entries.push({ amountType: "OrderFee", amount: orderFeeAmount });

    // ── MISC-FEE: Storage fees, monthly subscription fees, etc. ─────────────
    const miscFeeAmount  = parseFloat(col(row, "misc-fee-amount") || "0") || 0;
    if (miscFeeAmount !== 0) entries.push({ amountType: "MiscFee", amount: miscFeeAmount });

    // ── OTHER-FEE: Use reason description as amountType when available ───────
    const otherFeeReason = col(row, "other-fee-reason-description");
    const otherFeeAmount = parseFloat(col(row, "other-fee-amount") || "0") || 0;
    if (otherFeeAmount !== 0) {
      const label = otherFeeReason || "OtherFee";
      entries.push({ amountType: label, amount: otherFeeAmount });
    }

    // ── DIRECT-PAYMENT ────────────────────────────────────────────────────────
    const directPayType   = col(row, "direct-payment-type");
    const directPayAmount = parseFloat(col(row, "direct-payment-amount") || "0") || 0;
    if (directPayType && directPayAmount !== 0) entries.push({ amountType: directPayType, amount: directPayAmount });
    else if (!directPayType && directPayAmount !== 0) entries.push({ amountType: "DirectPayment", amount: directPayAmount });

    // ── OTHER-AMOUNT catch-all ────────────────────────────────────────────────
    const otherAmount    = parseFloat(col(row, "other-amount") || "0") || 0;
    if (otherAmount !== 0) entries.push({ amountType: "OtherAmount", amount: otherAmount });

    if (entries.length === 0) { skipped++; continue; }

    for (const entry of entries) {
      const k = `${orderId ?? ""}|${asin ?? ""}|${entry.amountType}|${transactionType}|${marketplace}`;
      const existing = agg.get(k);
      if (existing) {
        existing.amount += entry.amount;
        if (quantityPurchased) existing.quantityPurchased = (existing.quantityPurchased ?? 0) + quantityPurchased;
      } else {
        agg.set(k, {
          settlementId, transactionType,
          orderId, asin, sku, marketplace,
          amountType: entry.amountType, amount: entry.amount,
          currency, postedDate, quantityPurchased,
        });
      }
    }
  }

  // ── Save AmazonSettlement header (source of truth for totalAmount) ─────────
  if (headerStartDate && headerEndDate) {
    // Derive marketplace from transactions if not set from header
    const txMarketplace = Array.from(agg.values())
      .find(v => v.marketplace !== "EU")?.marketplace ?? headerMarketplace;

    await upsertAmazonSettlement(prisma, {
      settlementId,
      marketplace:  txMarketplace,
      totalAmount:  headerTotalAmount,
      startDate:    headerStartDate,
      endDate:      headerEndDate,
      depositDate:  headerDepositDate ?? undefined,
      currency:     headerCurrency,
    });
    console.log(`[Settlement] Header saved: ${settlementId} totalAmount=${headerTotalAmount} marketplace=${txMarketplace}`);
  }

  if (agg.size === 0) return { settlementId, upserted: 0, skipped, totalAmount: headerTotalAmount };

  // Delete existing rows for this settlement (idempotent re-sync)
  await deleteSettlementTransactions(prisma, settlementId);

  // Batch insert all aggregated entries
  const data = Array.from(agg.values());
  const upserted = await createSettlementTransactions(prisma, data as any);

  return { settlementId, upserted, skipped, totalAmount: headerTotalAmount };
}

// ─── Full settlement sync ─────────────────────────────────────────────────────
export async function syncSettlementReports(): Promise<void> {
  if (_settlementSyncing) {
    console.log("[Settlement] Sync already in progress — skipping concurrent request");
    return;
  }
  _settlementSyncing = true;
  console.log("[Settlement] Starting settlement report sync...");
  try { return await _doSync(); }
  finally { _settlementSyncing = false; }
}

async function _doSync(): Promise<void> {
  const reportIds = await listSettlementReports();

  if (reportIds.length === 0) {
    console.log("[Settlement] No settlement reports available.");
    return;
  }

  console.log(`[Settlement] Found ${reportIds.length} settlement reports`);
  let totalUpserted = 0;

  for (const reportId of reportIds) {
    try {
      console.log(`[Settlement] Processing report ${reportId}...`);
      const raw = await downloadSettlementReport(reportId);
      const rows = parseTsv(raw);

      const { settlementId, upserted, skipped, totalAmount } = await ingestSettlementRows(rows, reportId);
      totalUpserted += upserted;
      console.log(`[Settlement] Report ${reportId} → settlementId ${settlementId}: ${upserted} upserted, ${skipped} skipped, totalAmount=${totalAmount}`);

      await sleep(3000); // rate limit buffer between reports
    } catch (err) {
      console.error(`[Settlement] Report ${reportId} failed:`, err);
    }
  }

  console.log(`[Settlement] Sync complete — total upserted: ${totalUpserted}`);
}

// ─── Get aggregated fees per order ───────────────────────────────────────────
export async function getFeesForOrders(orderIds: string[]): Promise<Map<string, {
  commission: number;
  fbaFee: number;
  otherFees: number;
  refundAmount: number;
}>> {
  if (orderIds.length === 0) return new Map();

  const txns = await findTransactionsForOrders(prisma, orderIds);

  const result = new Map<string, { commission: number; fbaFee: number; otherFees: number; refundAmount: number }>();

  for (const t of txns) {
    if (!t.orderId) continue;
    if (!result.has(t.orderId)) result.set(t.orderId, { commission: 0, fbaFee: 0, otherFees: 0, refundAmount: 0 });
    const entry = result.get(t.orderId)!;

    if (t.amountType === "Commission" || t.amountType === "VariableClosingFee") {
      entry.commission += t.amount;
    } else if (t.amountType === "FBAPerUnitFulfillmentFee" || t.amountType === "FBAPerOrderFulfillmentFee") {
      entry.fbaFee += t.amount;
    } else if (t.transactionType === "Refund" && t.amountType === "Principal") {
      entry.refundAmount += Math.abs(t.amount);
    } else if (t.amountType !== "Principal" && t.amountType !== "Tax" && t.amountType !== "Promotion") {
      entry.otherFees += t.amount;
    }
  }

  return result;
}
