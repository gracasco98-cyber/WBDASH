import * as zlib from "zlib";
import { promisify } from "util";
import { MARKETPLACE_IDS, MARKETPLACE_REGION } from "./config";
import { spRequest, type SpRegion } from "./sp-api.service";

const gunzip = promisify(zlib.gunzip);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DataKioskTrafficRow {
  date: string;
  asin: string;
  sessions: number;
  pageViews: number;
  unitSessionPercentage: number | null;
}

export function buildSalesAndTrafficQuery(params: { asin: string; marketplace: string; from: string; to: string }): string {
  const marketplaceId = MARKETPLACE_IDS[params.marketplace];
  if (!marketplaceId) throw new Error(`Marketplace non supportato: ${params.marketplace}`);
  const safeAsin = params.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(safeAsin)) throw new Error(`ASIN non valido: ${params.asin}`);
  return `query ProductDailyTraffic {
    analytics_salesAndTraffic_2024_04_24 {
      salesAndTrafficTrends(
        startDate: "${params.from}"
        endDate: "${params.to}"
        dateAggregation: DAY
        asinAggregation: CHILD
        filters: [{ marketplaceId: "${marketplaceId}", asins: ["${safeAsin}"] }]
      ) {
        childAsin marketplaceId startDate endDate
        traffic { sessions pageViews unitSessionPercentage }
        sales { unitsOrdered orderedProductSales { amount currencyCode } }
      }
    }
  }`;
}

function collectTrafficRows(value: unknown, output: DataKioskTrafficRow[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTrafficRows(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const item = value as Record<string, any>;
  if (item.childAsin && item.startDate && item.traffic) {
    output.push({
      date: String(item.startDate).slice(0, 10), asin: String(item.childAsin),
      sessions: Number(item.traffic.sessions ?? 0), pageViews: Number(item.traffic.pageViews ?? 0),
      unitSessionPercentage: item.traffic.unitSessionPercentage == null ? null : Number(item.traffic.unitSessionPercentage),
    });
  }
  Object.values(item).forEach((child) => collectTrafficRows(child, output));
}

export function parseDataKioskJsonLines(text: string): DataKioskTrafficRow[] {
  const rows: DataKioskTrafficRow[] = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) collectTrafficRows(JSON.parse(line), rows);
  return rows;
}

async function downloadDataKioskDocument(documentId: string, region: SpRegion): Promise<string> {
  const metadata = await spRequest("GET", `/dataKiosk/2023-11-15/documents/${documentId}`, undefined, 3, region);
  const url = metadata.documentUrl ?? metadata.url ?? metadata.payload?.documentUrl;
  if (!url) throw new Error("Data Kiosk non ha restituito il documento");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download Data Kiosk fallito: ${response.status}`);
  let buffer = Buffer.from(await response.arrayBuffer());
  if ((metadata.compressionAlgorithm ?? metadata.payload?.compressionAlgorithm) === "GZIP") buffer = await gunzip(buffer);
  return buffer.toString("utf8");
}

export async function fetchDailySalesAndTraffic(params: { asin: string; marketplace: string; from: string; to: string }): Promise<DataKioskTrafficRow[]> {
  const region = (MARKETPLACE_REGION[params.marketplace] ?? "EU") as SpRegion;
  const created = await spRequest("POST", "/dataKiosk/2023-11-15/queries", { query: buildSalesAndTrafficQuery(params) }, 3, region);
  const queryId = created.queryId ?? created.payload?.queryId;
  if (!queryId) throw new Error("Data Kiosk non ha restituito queryId");

  let documentId: string | undefined;
  for (let attempt = 0; attempt < 36; attempt++) {
    if (attempt > 0) await sleep(5_000);
    const status = await spRequest("GET", `/dataKiosk/2023-11-15/queries/${queryId}`, undefined, 3, region);
    const data = status.payload ?? status;
    if (data.processingStatus === "DONE") { documentId = data.dataDocumentId; break; }
    if (["CANCELLED", "FATAL"].includes(data.processingStatus)) {
      const errorDocumentId = data.errorDocumentId;
      const details = errorDocumentId ? (await downloadDataKioskDocument(errorDocumentId, region)).slice(0, 1_000) : "";
      throw new Error(`Data Kiosk: ${data.processingStatus}${details ? ` — ${details}` : ""}`);
    }
  }
  if (!documentId) throw new Error("Data Kiosk: timeout in attesa del report");

  return parseDataKioskJsonLines(await downloadDataKioskDocument(documentId, region));
}
