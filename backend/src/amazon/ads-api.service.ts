// amazon/ads-api.service.ts — Amazon Advertising API v3 client
// Key findings from live testing:
//   - API host: advertising-api-eu.amazon.com
//   - SP listing endpoints use POST with versioned Content-Type headers
//   - Daily metrics use Reports v3 API (POST /reporting/reports, async)
//   - Profile ID passed as Amazon-Advertising-API-Scope header

import { ADS_ENDPOINT } from "./config";
import { getAdsApiToken, invalidateTokens } from "./token.service";
import { getAccountCredentials } from "../repositories/amazon/accounts.repo";
import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ADS_CLIENT_ID = () =>
  process.env.AMAZON_ADVERTISING_CLIENT_ID || process.env.AMAZON_LWA_CLIENT_ID || "";

// ── Content-Type mapping for SP v3 endpoints ─────────────────────────────────
// Amazon SP v3 requires specific vendor media types for POST listing endpoints
function spContentType(path: string): string {
  if (path.includes("/sp/campaigns"))  return "application/vnd.spcampaign.v3+json";
  if (path.includes("/sp/adGroups"))   return "application/vnd.spadGroup.v3+json";
  if (path.includes("/sp/keywords"))   return "application/vnd.spkeyword.v3+json";
  if (path.includes("/sp/productAds")) return "application/vnd.spProductAd.v3+json";
  if (path.includes("/sp/targets"))    return "application/vnd.spTargetingClause.v3+json";
  return "application/json";
}

/** Make an authenticated Advertising API call */
async function adsRequest(
  method: string,
  path: string,
  profileId: string,
  body?: any
): Promise<any> {
  const token = await getAdsApiToken();
  const ct = method === "POST" ? spContentType(path) : "application/json";

  const headers: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    ct,
    Accept:                            ct,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000); // 30s timeout
  let res: Response;
  try {
    res = await fetch(`${ADS_ENDPOINT}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    invalidateTokens();
    throw new Error("[Ads API] 401 Unauthorized — token invalidated");
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`[Ads API] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  if (!text)   return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ── Profile helpers ───────────────────────────────────────────────────────────
export interface AdsProfileInfo {
  profileId: string;
  marketplace: string;
  countryCode: string;
  currency: string;
}

/** Resolve the Ads API profile ID for a marketplace from the current account's credentials
 *  (AmazonAccount.adsProfileIds, a JSON map of marketplace code → profile ID) instead of
 *  from global env vars — see repositories/amazon/accounts.repo.ts. */
export async function getProfileId(marketplace: string): Promise<string> {
  const creds = await getAccountCredentials(prisma, getCurrentAccountId());
  const pid = creds.adsProfileIds[marketplace];
  if (!pid) throw new Error(`[Ads API] No profile ID configured for ${marketplace} on this Amazon account`);
  return pid;
}

/** All configured marketplaces and their profile IDs for the current account */
export async function getConfiguredProfiles(): Promise<AdsProfileInfo[]> {
  const creds = await getAccountCredentials(prisma, getCurrentAccountId());
  const profiles: AdsProfileInfo[] = [];
  for (const [mp, pid] of Object.entries(creds.adsProfileIds)) {
    if (pid) profiles.push({ profileId: pid, marketplace: mp, countryCode: mp, currency: mp === "UK" ? "GBP" : mp === "SE" ? "SEK" : mp === "PL" ? "PLN" : "EUR" });
  }
  return profiles;
}

/** List all profiles from the API (used to verify connection) */
export async function listProfiles(): Promise<AdsProfileInfo[]> {
  const token = await getAdsApiToken();
  const res = await fetch(`${ADS_ENDPOINT}/v2/profiles`, {
    headers: {
      "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`[Ads API] GET /v2/profiles → ${res.status}`);
  const profiles = await res.json() as any[];
  return profiles
    .filter((p: any) => p.accountInfo?.type === "seller")
    .map((p: any) => ({
      profileId: String(p.profileId),
      marketplace: p.countryCode,
      countryCode: p.countryCode,
      currency: p.currencyCode || "EUR",
    }));
}

// ── SP Campaigns (v3 listing) ─────────────────────────────────────────────────
export interface SpCampaign {
  campaignId: string;
  name: string;
  state: string;
  budget: number;
}

export async function listSPCampaigns(profileId: string): Promise<SpCampaign[]> {
  // v3 uses POST /sp/campaigns/list with versioned Content-Type
  const res = await adsRequest("POST", "/sp/campaigns/list", profileId, {
    stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] },
    maxResults: 100,
  });

  const items: any[] = res?.campaigns ?? res?.data?.campaigns ?? [];
  return items.map((c: any) => ({
    campaignId: String(c.campaignId || ""),
    name: c.name || c.campaignName || "",
    state: c.state || c.extendedData?.state || "",
    budget: Number(c.budget?.budget ?? c.dailyBudget ?? 0),
  }));
}

// ── Reports v3 helpers ────────────────────────────────────────────────────────

/** Poll a report until COMPLETED, with adaptive intervals */
async function pollReportUntilDone(
  reportId: string,
  hdrs: Record<string, string>,
  label: string
): Promise<string> {
  // Adaptive polling: 5s × 12 → 10s × 12 → 15s × remaining (max 45 min)
  const schedule = [
    ...Array(12).fill(5_000),    // first minute: check every 5s
    ...Array(12).fill(10_000),   // next 2 min: every 10s
    ...Array(120).fill(15_000),  // remaining: every 15s (up to ~37 min more → 40 min total)
  ];
  for (let i = 0; i < schedule.length; i++) {
    await sleep(schedule[i]);
    const pr = await fetch(`${ADS_ENDPOINT}/reporting/reports/${reportId}`, { headers: hdrs });
    if (!pr.ok) continue;
    const st = await pr.json() as any;
    if (st.status === "COMPLETED") return st.url;
    if (st.status === "FAILURE" || st.status === "FATAL" || st.status === "CANCELLED")
      throw new Error(`[${label}] Report ${reportId} ${st.status}`);
    if (i % 6 === 0) console.log(`[${label}] ${reportId} status=${st.status} attempt=${i + 1}`);
  }
  throw new Error(`[${label}] Report ${reportId} timed out after 45 min`);
}

/** Create a report, handling 425 (duplicate) by reusing the existing reportId */
async function createOrReuseReport(
  path: string,
  body: any,
  hdrs: Record<string, string>,
  label: string
): Promise<string> {
  const cr = await fetch(`${ADS_ENDPOINT}${path}`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(body),
  });
  if (cr.ok) {
    const j = await cr.json() as any;
    const id = j?.reportId;
    if (!id) throw new Error(`[${label}] No reportId in create response`);
    console.log(`[${label}] Created report ${id}`);
    return id;
  }
  // 425 = duplicate in flight — extract and reuse existing reportId
  const errText = await cr.text();
  if (cr.status === 425) {
    const match = errText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) {
      console.log(`[${label}] 425 duplicate — reusing existing report ${match[0]}`);
      return match[0];
    }
  }
  throw new Error(`[${label}] Create → ${cr.status}: ${errText.slice(0, 300)}`);
}

// ── Reports v3 (async daily metrics) ─────────────────────────────────────────
export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  date?: string;        // YYYY-MM-DD — present in DAILY range reports
  adGroupId?: string;
  adGroupName?: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

/**
 * Fetch daily SP campaign metrics via Reports v3 API.
 * Reports v3 uses application/json (not the versioned types).
 * Supports date ranges — use DAILY timeUnit to get per-day breakdown in one report.
 */
export async function fetchSPCampaignReport(
  profileId: string,
  startDate: string,  // YYYY-MM-DD
  endDate?: string    // YYYY-MM-DD (default = startDate for single-day)
): Promise<CampaignReport[]> {
  const end = endDate ?? startDate;
  const token = await getAdsApiToken();
  const reportHeaders: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    "application/json",
    Accept:                            "application/json",
  };

  // Step 1: Create report — always use DAILY so we get per-day rows with "date" field.
  // SUMMARY timeUnit does NOT support the "date" column and causes 400 errors.
  const createBody = {
    name: `SP ${startDate}:${end}`,
    startDate,
    endDate: end,
    configuration: {
      adProduct:    "SPONSORED_PRODUCTS",
      groupBy:      ["campaign"],
      columns:      ["campaignId", "campaignName", "impressions", "clicks", "cost", "purchases30d", "sales30d", "date"],
      reportTypeId: "spCampaigns",
      timeUnit:     "DAILY",   // Always DAILY — works for both single-day and ranges
      format:       "GZIP_JSON",
    },
  };

  const reportId = await createOrReuseReport("/reporting/reports", createBody, reportHeaders, "Ads Campaign Reports");
  console.log(`[Ads Campaign Reports] Polling report ${reportId} for profile ${profileId} ${startDate}→${end}`);
  const dlUrl = await pollReportUntilDone(reportId, reportHeaders, "Ads Campaign Reports");

  // Download + decompress (gzip JSON)
  const dlRes = await fetch(dlUrl);
  if (!dlRes.ok) throw new Error(`[Ads Campaign Reports] Download failed: ${dlRes.status}`);

  const buffer = await dlRes.arrayBuffer();
  const { gunzipSync } = await import("zlib");
  const decompressed = gunzipSync(Buffer.from(buffer));
  const data = JSON.parse(decompressed.toString("utf8")) as any[];

  return data.map((row: any) => ({
    campaignId:   String(row.campaignId || ""),
    campaignName: row.campaignName || "",
    date:         row.date ?? startDate,   // present in DAILY reports
    impressions:  Number(row.impressions ?? 0),
    clicks:       Number(row.clicks ?? 0),
    spend:        Number(row.cost ?? row.spend ?? 0),
    sales:        Number(row.sales30d ?? row.sales ?? 0),
    orders:       Number(row.purchases30d ?? row.orders ?? 0),
  }));
}

/** Check if Advertising API is configured for the current account */
export async function isAdsConfigured(): Promise<boolean> {
  try {
    const creds = await getAccountCredentials(prisma, getCurrentAccountId());
    return !!(
      (creds.adsClientId || creds.lwaClientId) &&
      (creds.adsRefreshToken || creds.spApiRefreshToken) &&
      Object.keys(creds.adsProfileIds).length > 0
    );
  } catch {
    return false;
  }
}

// ── SP Ad Groups (v3 listing) ─────────────────────────────────────────────────
export interface SpAdGroup {
  adGroupId:  string;
  campaignId: string;
  name:       string;
  defaultBid: number;
  state:      string;
}

export async function listSPAdGroups(profileId: string): Promise<SpAdGroup[]> {
  const all: SpAdGroup[] = [];
  let startIndex = 0;
  const PAGE = 100;
  let pages = 0;

  while (pages < 50) { // max 50 pages = 5000 ad groups
    pages++;
    const res = await adsRequest("POST", "/sp/adGroups/list", profileId, {
      maxResults: PAGE,
      startIndex,
    });
    const items: any[] = res?.adGroups ?? res?.data?.adGroups ?? res ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    for (const g of items) {
      all.push({
        adGroupId:  String(g.adGroupId  ?? ""),
        campaignId: String(g.campaignId ?? ""),
        name:       g.name ?? g.adGroupName ?? "",
        defaultBid: Number(g.defaultBid ?? 0),
        state:      (g.state ?? "").toUpperCase(),
      });
    }
    if (items.length < PAGE) break;
    startIndex += PAGE;
  }
  return all;
}

// ── SP Keywords (v3 listing) ──────────────────────────────────────────────────
export interface SpKeyword {
  keywordId:   string;
  campaignId:  string;
  adGroupId:   string;
  keywordText: string;
  matchType:   string;  // BROAD | PHRASE | EXACT
  state:       string;
  bid:         number;
}

export async function listSPKeywords(profileId: string): Promise<SpKeyword[]> {
  const all: SpKeyword[] = [];
  let startIndex = 0;
  const PAGE = 100;

  while (true) {
    const res = await adsRequest("POST", "/sp/keywords/list", profileId, {
      stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] },
      startIndex,
      maxResults: PAGE,
    });
    const items: any[] = res?.keywords ?? res?.data?.keywords ?? [];
    for (const k of items) {
      all.push({
        keywordId:   String(k.keywordId  ?? ""),
        campaignId:  String(k.campaignId ?? ""),
        adGroupId:   String(k.adGroupId  ?? ""),
        keywordText: k.keywordText ?? k.keyword ?? "",
        matchType:   (k.matchType ?? "").toUpperCase(),
        state:       (k.state ?? "").toUpperCase(),
        bid:         Number(k.bid ?? 0),
      });
    }
    if (items.length < PAGE) break;
    startIndex += PAGE;
  }
  return all;
}

// ── SP Keyword Metrics Report (async) ─────────────────────────────────────────
export interface KeywordReport {
  campaignId:   string;
  campaignName: string;
  adGroupId:    string;
  adGroupName:  string;
  keywordId:    string;
  keywordText:  string;
  matchType:    string;
  date?:        string;
  impressions:  number;
  clicks:       number;
  spend:        number;
  sales:        number;
  orders:       number;
}

export async function fetchSPKeywordReport(
  profileId:  string,
  startDate:  string,
  endDate?:   string
): Promise<KeywordReport[]> {
  const end = endDate ?? startDate;
  const isRange = startDate !== end;
  const token = await getAdsApiToken();
  const hdrs: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  // Amazon spKeywords report v3 requires groupBy: ["adGroup"] only.
  // Extra dimension columns (campaignId, adGroupId) cause very slow report generation.
  // We get the campaign mapping separately via listSPAdGroups live API.
  const body = {
    name: `SP Keywords ${startDate}:${end} v${Date.now()}`,
    startDate,
    endDate: end,
    configuration: {
      adProduct:    "SPONSORED_PRODUCTS",
      groupBy:      ["adGroup"],
      columns:      ["keywordId", "keyword", "matchType",
                     "impressions", "clicks", "cost", "purchases30d", "sales30d"],
      reportTypeId: "spKeywords",
      timeUnit:     "SUMMARY",
      format:       "GZIP_JSON",
    },
  };

  const reportId = await createOrReuseReport("/reporting/reports", body, hdrs, "Ads KW Report");
  console.log(`[Ads KW Report] Polling ${reportId} for ${profileId} ${startDate}→${end}`);
  const dlUrl = await pollReportUntilDone(reportId, hdrs, "Ads KW Report");

  const dl = await fetch(dlUrl);
  if (!dl.ok) throw new Error(`[Ads KW Report] Download failed ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const { gunzipSync } = await import("zlib");
  const data = JSON.parse(gunzipSync(buf).toString("utf8")) as any[];
  return data.map((r: any) => ({
    campaignId:   String(r.campaignId  ?? ""),
    campaignName: r.campaignName ?? "",
    adGroupId:    String(r.adGroupId   ?? ""),
    adGroupName:  r.adGroupName  ?? "",
    keywordId:    String(r.keywordId   ?? ""),
    keywordText:  r.keywordText ?? r.keyword ?? "",  // v3 uses "keyword" column name
    matchType:    (r.matchType   ?? "").toUpperCase(),
    date:         r.date,   // SUMMARY has no date field
    impressions:  Number(r.impressions ?? 0),
    clicks:       Number(r.clicks      ?? 0),
    spend:        Number(r.cost ?? r.spend ?? 0),
    sales:        Number(r.sales30d ?? r.sales ?? 0),
    orders:       Number(r.purchases30d ?? r.orders ?? 0),
  }));
}

// ── SP Search Term Report (async) ─────────────────────────────────────────────
export interface SearchTermReport {
  campaignId:   string;
  campaignName: string;
  adGroupId:    string;
  keywordText:  string;
  matchType:    string;
  query:        string;   // actual search term customer typed
  impressions:  number;
  clicks:       number;
  spend:        number;
  sales:        number;
  orders:       number;
}

export async function fetchSPSearchTermReport(
  profileId:  string,
  startDate:  string,
  endDate?:   string
): Promise<SearchTermReport[]> {
  const end = endDate ?? startDate;
  const token = await getAdsApiToken();
  const hdrs: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  const body = {
    name: `SP SearchTerm ${startDate}:${end}`,
    startDate,
    endDate: end,
    configuration: {
      adProduct:    "SPONSORED_PRODUCTS",
      groupBy:      ["searchTerm"],
      columns:      ["campaignId", "campaignName", "adGroupId", "adGroupName",
                     "keywordId", "keywordText", "matchType", "query",
                     "impressions", "clicks", "cost", "purchases30d", "sales30d"],
      reportTypeId: "spSearchTerm",
      timeUnit:     "SUMMARY",
      format:       "GZIP_JSON",
    },
  };

  const reportId = await createOrReuseReport("/reporting/reports", body, hdrs, "Ads ST Report");
  console.log(`[Ads ST Report] Polling ${reportId} for ${profileId}`);
  const dlUrl = await pollReportUntilDone(reportId, hdrs, "Ads ST Report");

  const dl = await fetch(dlUrl);
  if (!dl.ok) throw new Error(`[Ads ST Report] Download failed ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const { gunzipSync } = await import("zlib");
  const data = JSON.parse(gunzipSync(buf).toString("utf8")) as any[];
  return data.map((r: any) => ({
    campaignId:   String(r.campaignId  ?? ""),
    campaignName: r.campaignName ?? "",
    adGroupId:    String(r.adGroupId   ?? ""),
    keywordText:  r.keywordText  ?? "",
    matchType:    (r.matchType   ?? "").toUpperCase(),
    query:        r.query        ?? r.keywordText ?? "",
    impressions:  Number(r.impressions ?? 0),
    clicks:       Number(r.clicks      ?? 0),
    spend:        Number(r.cost ?? r.spend ?? 0),
    sales:        Number(r.sales30d ?? r.sales ?? 0),
    orders:       Number(r.purchases30d ?? r.orders ?? 0),
  }));
}
