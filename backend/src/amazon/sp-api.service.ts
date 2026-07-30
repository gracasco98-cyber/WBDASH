// amazon/sp-api.service.ts — Amazon Selling Partner API report client

import * as zlib from "zlib";
import { promisify } from "util";
import {
  EU_ENDPOINT,
  NA_ENDPOINT,
  ORDER_REPORT_TYPE,
  REPORT_POLL_INTERVAL_MS,
  REPORT_MAX_POLLS,
} from "./config";
import { getSpApiToken, getSpApiTokenNA, invalidateTokens } from "./token.service";

const gunzip = promisify(zlib.gunzip);

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Region type */
export type SpRegion = "EU" | "NA";

/** Select endpoint based on region */
function regionEndpoint(region: SpRegion): string {
  return region === "NA" ? NA_ENDPOINT : EU_ENDPOINT;
}

/** Select token getter based on region */
function regionTokenFn(region: SpRegion): () => Promise<string> {
  return region === "NA" ? getSpApiTokenNA : getSpApiToken;
}

/** Make an authenticated SP-API request with automatic 429 backoff */
async function spRequest(method: string, path: string, body?: any, retries = 3, region: SpRegion = "EU"): Promise<any> {
  const endpoint  = regionEndpoint(region);
  const getToken  = regionTokenFn(region);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const token = await getToken();
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        "x-amz-access-token": token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      invalidateTokens();
      throw new Error("[SP-API] 401 Unauthorized — token invalidated, retry");
    }

    if (res.status === 429) {
      if (attempt < retries) {
        const wait = attempt * 20_000; // 20s, 40s
        console.log(`[SP-API] 429 on ${method} ${path}, waiting ${wait / 1000}s (retry ${attempt + 1}/${retries})...`);
        await sleep(wait);
        continue;
      }
      const text = await res.text();
      throw new Error(`[SP-API] ${method} ${path} → 429: ${text}`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[SP-API] ${method} ${path} → ${res.status}: ${text}`);
    }

    return res.json();
  }
  throw new Error(`[SP-API] ${method} ${path}: all retries exhausted`);
}

/** Request a flat-file orders report for a date range and marketplace IDs */
export async function requestOrderReport(
  marketplaceIds: string[],
  dataStartTime: Date,
  dataEndTime: Date,
  region: SpRegion = "EU"
): Promise<string> {
  const body = {
    reportType: ORDER_REPORT_TYPE,
    marketplaceIds,
    dataStartTime: dataStartTime.toISOString(),
    dataEndTime: dataEndTime.toISOString(),
    reportOptions: {},
  };

  const json = await spRequest("POST", "/reports/2021-06-30/reports", body, 3, region);
  const reportId: string = json.reportId;
  console.log(`[SP-API ${region}] Report requested: ${reportId}`);
  return reportId;
}

/** Poll until report is DONE or CANCELLED/FATAL. Returns reportDocumentId */
export async function pollReport(reportId: string, region: SpRegion = "EU"): Promise<string> {
  for (let attempt = 0; attempt < REPORT_MAX_POLLS; attempt++) {
    await sleep(REPORT_POLL_INTERVAL_MS);

    const json = await spRequest("GET", `/reports/2021-06-30/reports/${reportId}`, undefined, 3, region);
    const status: string = json.processingStatus;

    console.log(`[SP-API ${region}] Report ${reportId} status: ${status} (attempt ${attempt + 1})`);

    if (status === "DONE") {
      if (!json.reportDocumentId) throw new Error(`[SP-API] Report DONE but no reportDocumentId`);
      return json.reportDocumentId;
    }

    if (status === "CANCELLED" || status === "FATAL") {
      throw new Error(`[SP-API] Report ${reportId} ended with status ${status}`);
    }

    // IN_QUEUE or IN_PROGRESS → keep polling
  }

  throw new Error(`[SP-API] Report ${reportId} timed out after ${REPORT_MAX_POLLS} polls`);
}

/** Download the report document (handles gzip decompression + 429 retry) */
export async function downloadReport(reportDocumentId: string, region: SpRegion = "EU"): Promise<string> {
  // Retry getDocument metadata up to 3 times on 429
  let json: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      json = await spRequest("GET", `/reports/2021-06-30/documents/${reportDocumentId}`, undefined, 3, region);
      break;
    } catch (err) {
      const msg = String(err);
      if (msg.includes("429") && attempt < 3) {
        const wait = attempt * 30_000; // 30s, 60s
        console.log(`[SP-API] 429 on document metadata, waiting ${wait / 1000}s before retry ${attempt + 1}/3...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }

  const url: string = json.url;
  const compressionAlgorithm: string | undefined = json.compressionAlgorithm;
  console.log(`[SP-API] Downloading report document ${reportDocumentId} (compression: ${compressionAlgorithm ?? "none"})`);

  // Retry actual download up to 3 times on 429
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      if (attempt < 3) {
        const wait = attempt * 30_000;
        console.log(`[SP-API] 429 on document download, waiting ${wait / 1000}s before retry ${attempt + 1}/3...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`[SP-API] Document download failed after 3 retries: 429`);
    }
    if (!res.ok) throw new Error(`[SP-API] Document download failed: ${res.status}`);

    if (compressionAlgorithm === "GZIP") {
      const buffer = Buffer.from(await res.arrayBuffer());
      const decompressed = await gunzip(buffer);
      return decompressed.toString("utf-8");
    }
    return res.text();
  }

  throw new Error(`[SP-API] Document download: unexpected exit from retry loop`);
}

/** Full pipeline: request → poll → download → return raw TSV string */
export async function fetchOrderReport(
  marketplaceIds: string[],
  dateFrom: Date,
  dateTo: Date,
  region: SpRegion = "EU"
): Promise<string> {
  const reportId = await requestOrderReport(marketplaceIds, dateFrom, dateTo, region);
  const docId    = await pollReport(reportId, region);
  return downloadReport(docId, region);
}

// ── FBA Inventory API ──────────────────────────────────────────────────────────

export interface FbaInventoryItem {
  asin:                  string;
  fnSku:                 string;
  sellerSku:             string;
  productName:           string;
  marketplaceId:         string;
  totalQuantity:         number;
  fulfillableQuantity:   number;   // Available / Disponibile
  inboundQuantity:       number;   // Working + Shipped + Receiving
  inboundWorking:        number;
  inboundShipped:        number;
  inboundReceiving:      number;
  reservedQuantity:      number;   // Pending orders + FC processing
  unfulfillableQuantity: number;   // Damaged / defective
  customerDamaged:       number;
  warehouseDamaged:      number;
  defective:             number;
  expired:               number;
  researchingQuantity:   number;   // Lost / being researched
}

/**
 * Fetch real-time FBA inventory for a given Amazon marketplace ID.
 * Handles cursor pagination automatically.
 */
export async function fetchFbaInventory(marketplaceId: string, region: SpRegion = "EU"): Promise<FbaInventoryItem[]> {
  const items: FbaInventoryItem[] = [];
  let nextToken: string | undefined;

  do {
    const params = new URLSearchParams({
      details:         "true",
      granularityType: "Marketplace",
      granularityId:   marketplaceId,
      marketplaceIds:  marketplaceId,
    });
    if (nextToken) params.set("nextToken", nextToken);

    const response = await spRequest("GET", `/fba/inventory/v1/summaries?${params}`, undefined, 3, region);
    const summaries: any[] = response?.payload?.inventorySummaries ?? [];

    for (const s of summaries) {
      const d  = s.inventoryDetails ?? {};
      const ub = d.unfulfillableQuantity ?? {};
      items.push({
        asin:                  s.asin        ?? "",
        fnSku:                 s.fnSku       ?? "",
        sellerSku:             s.sellerSku   ?? "",
        productName:           s.productName ?? "",
        marketplaceId,
        totalQuantity:         Number(s.totalQuantity ?? 0),
        fulfillableQuantity:   Number(d.fulfillableQuantity ?? 0),
        inboundWorking:        Number(d.inboundWorkingQuantity   ?? 0),
        inboundShipped:        Number(d.inboundShippedQuantity   ?? 0),
        inboundReceiving:      Number(d.inboundReceivingQuantity ?? 0),
        inboundQuantity:
          Number(d.inboundWorkingQuantity ?? 0) +
          Number(d.inboundShippedQuantity ?? 0) +
          Number(d.inboundReceivingQuantity ?? 0),
        reservedQuantity:      Number(d.reservedQuantity?.totalReservedQuantity ?? 0),
        unfulfillableQuantity: Number(ub.totalUnfulfillableQuantity ?? 0),
        customerDamaged:       Number(ub.customerDamagedQuantity    ?? 0),
        warehouseDamaged:      Number(ub.warehouseDamagedQuantity   ?? 0),
        defective:             Number(ub.defectiveQuantity          ?? 0),
        expired:               Number(ub.expiredQuantity            ?? 0),
        researchingQuantity:   Number(d.researchingQuantity?.totalResearchingQuantity ?? 0),
      });
    }

    nextToken = response?.pagination?.nextToken ?? undefined;
  } while (nextToken);

  console.log(`[FBA Inventory] ${marketplaceId}: ${items.length} items`);
  return items;
}
