// lib/api/amazon.ts — Amazon endpoints
import { apiUrl, get } from "./client";
import type {
  AmazonOverview,
  AmazonSummary,
  TimePoint,
  AmazonOrdersResponse,
  AmazonProductsResponse,
  AmazonProductHistoryPoint,
  AmazonDashboardResponse,
  AmazonPpcResponse,
  AmazonSyncJob,
  AmazonCogs,
  AmazonCogsPriceEntry,
  AmazonPLResponse,
  AmazonInventoryItem,
  AmazonFeeBreakdown,
  AmazonPaymentForecast,
  AmazonUnreconciledResponse,
  AmazonAccountSummary,
} from "./types";

export const amazon = {
  // ── Account management ──────────────────────────────────────────────────────
  listAccounts: () =>
    get<AmazonAccountSummary[]>("/api/amazon/accounts"),

  overview: (params?: Record<string, string>) =>
    get<AmazonOverview>("/api/amazon/overview", params),

  summary: (params: Record<string, string>) =>
    get<AmazonSummary>("/api/amazon/summary", params),

  timeseries: (params: Record<string, string>) =>
    get<TimePoint[]>("/api/amazon/timeseries", params),

  orders: (params: Record<string, string>) =>
    get<AmazonOrdersResponse>("/api/amazon/orders", params),

  products: (params: Record<string, string>) =>
    get<AmazonProductsResponse>("/api/amazon/products", params),

  productHistory: (asin: string, params: Record<string, string>) =>
    get<AmazonProductHistoryPoint[]>(`/api/amazon/products/${encodeURIComponent(asin)}/history`, params),

  dashboard: () =>
    get<AmazonDashboardResponse>("/api/amazon/dashboard"),

  ppc: (params: Record<string, string>) =>
    get<AmazonPpcResponse>("/api/amazon/ppc", params),

  ppcTimeseries: (params: Record<string, string>) =>
    get<Array<{ date: string; spend: number; sales: number }>>("/api/amazon/ppc/timeseries", params),

  syncJobs: () =>
    get<AmazonSyncJob[]>("/api/amazon/sync/jobs"),

  triggerBackfill: (days: number, marketplace?: string) =>
    fetch(apiUrl("/api/amazon/sync/backfill"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, marketplace }),
    }),

  triggerIncremental: () =>
    fetch(apiUrl("/api/amazon/sync/incremental"), { method: "POST" }),

  triggerSnapshot: () =>
    fetch(apiUrl("/api/amazon/sync/snapshot"), { method: "POST" }),

  triggerSnapshotFull: (days = 180) =>
    fetch(apiUrl("/api/amazon/sync/snapshot/full"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    }),

  triggerHistorical: (days = 180) =>
    fetch(apiUrl("/api/amazon/sync/historical"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    }),

  triggerSettlement: () =>
    fetch(apiUrl("/api/amazon/sync/settlement"), { method: "POST" }),

  cogs: () =>
    get<AmazonCogs[]>("/api/amazon/cogs"),

  saveCogs: (asin: string, marketplace: string, cogsPerUnit: number, notes?: string) =>
    fetch(apiUrl("/api/amazon/cogs"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asin, marketplace, cogsPerUnit, notes }),
    }).then((r) => r.json() as Promise<AmazonCogs>),

  deleteCogs: (id: string) =>
    fetch(apiUrl(`/api/amazon/cogs/${id}`), { method: "DELETE" }),

  bulkImportCogs: (records: any[]) =>
    fetch(apiUrl("/api/amazon/cogs/bulk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    }).then((r) => r.json()),

  cogsEntries: (asin?: string) =>
    get<AmazonCogsPriceEntry[]>("/api/amazon/cogs/entries", asin ? { asin } : undefined),

  saveCogsPriceEntry: (data: Partial<AmazonCogsPriceEntry>) =>
    data.id
      ? fetch(apiUrl(`/api/amazon/cogs/entries/${data.id}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json())
      : fetch(apiUrl("/api/amazon/cogs/entries"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),

  deleteCogsPriceEntry: (id: string) =>
    fetch(apiUrl(`/api/amazon/cogs/entries/${id}`), { method: "DELETE" }).then(r => r.json()),

  pl: (params?: Record<string, string>) =>
    get<AmazonPLResponse>("/api/amazon/pl", params),

  // amazonAccountId=ALL: catalog images are account-agnostic (same ASIN, same
  // photo, regardless of which seller account's SP-API token fetches it), but
  // amazonAccountMiddleware leaves no account bound when 2+ accounts are
  // active and none is specified — without this, every lookup throws "No
  // Amazon account in scope" and no image ever loads.
  catalogImages: (asins: string[]) =>
    get<Record<string, string | null>>("/api/amazon/catalog/images", { asins: asins.join(","), amazonAccountId: "ALL" }),

  inventory: (params?: Record<string, string>) =>
    get<{ inventory: AmazonInventoryItem[] }>("/api/amazon/inventory", params),

  fbaInventory: (params?: Record<string, string>) =>
    get<{ items: any[]; total: number; syncedAt: string }>("/api/amazon/fba-inventory", params),

  ppcKeywords: (params?: Record<string, string>) =>
    get<{ keywords: any[]; total: number }>("/api/amazon/ppc/keywords", params),

  ppcCampaignDetail: (campaignId: string, params?: Record<string, string>) =>
    get<{ daily: any[]; keywords: any[] }>(`/api/amazon/ppc/campaigns/${campaignId}`, params),

  ppcProducts: (params?: Record<string, string>) =>
    get<{
      products: Array<{
        product: string; asin: string | null;
        spend: number; sales: number; clicks: number; impressions: number; orders: number;
        dailySpend: number; acos: number | null; roas: number | null; ctr: number;
        campaignCount: number;
        campaigns: Array<{ campaignId: string; campaignName: string; marketplace: string; spend: number; sales: number; orders: number; acos: number | null }>;
      }>;
      totals: { spend: number; sales: number; orders: number; products: number };
      daysInPeriod: number;
    }>("/api/amazon/ppc/products", params),

  ppcAdGroups: (params?: Record<string, string>) =>
    get<{ adGroups: any[]; total: number }>("/api/amazon/ppc/adgroups", params),

  ppcSearchTerms: (params?: Record<string, string>) =>
    get<{
      searchTerms: Array<{
        query: string; keywordText: string; matchType: string;
        campaignId: string; campaignName: string; adGroupId: string;
        marketplace: string; impressions: number; clicks: number;
        spend: number; sales: number; orders: number;
        acos: number | null; roas: number | null; ctr: number; cpc: number;
        isWasted: boolean;
      }>;
      total: number;
      totals: { spend: number; sales: number; clicks: number; orders: number; wasted: number; wastedCount: number };
      syncing: boolean;
      generatedAt: string | null;
      dateFrom: string | null;
      dateTo: string | null;
      source: "cache" | "db";
    }>("/api/amazon/ppc/search-terms", params),

  triggerKeywordSync: (days = 30) =>
    fetch(apiUrl("/api/amazon/sync/ads/keywords"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    }).then((r) => r.json()),

  triggerSearchTermSync: (days = 30, marketplace?: string) =>
    fetch(apiUrl("/api/amazon/sync/ads/search-terms"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, marketplace }),
    }).then((r) => r.json()),

  updateInventory: (data: Partial<AmazonInventoryItem>) =>
    fetch(apiUrl("/api/amazon/inventory"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  fees: (params?: Record<string, string>) =>
    get<{ breakdown: AmazonFeeBreakdown[]; totalFees: number }>("/api/amazon/fees", params),

  exportOrders: (params: Record<string, string>) => {
    window.open(apiUrl("/api/amazon/export/orders", params), "_blank");
  },

  // ── Advertising API ────────────────────────────────────────────────────────
  adsStatus: () =>
    get<{ ok: boolean; profiles: any[]; error?: string }>("/api/amazon/ads/status"),

  adsCampaigns: (marketplace = "IT") =>
    get<{ campaigns: any[]; count: number }>(`/api/amazon/ads/campaigns?marketplace=${marketplace}`),

  adsDaily: (params?: Record<string, string>) =>
    get<{
      daily: Array<{ date: string; spend: number; sales: number; clicks: number; impressions: number; orders: number; acos: number | null }>;
      totals: { spend: number; sales: number; clicks: number; impressions: number; orders: number; acos: number | null; roas: number | null; ctr: number | null; cpc: number | null };
    }>("/api/amazon/ads/daily", params),

  triggerAdsSync: (days?: number) =>
    fetch(apiUrl("/api/amazon/sync/ads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(days ? { days } : {}),
    }),

  payments: (params?: Record<string, string>) =>
    get<{
      settlements: Array<{
        settlementId: string;
        marketplace: string;
        dateFrom: string;
        dateTo: string;
        depositDate: string | null;
        currency: string;
        netPayout: number;       // REAL bank transfer (from AmazonSettlement header)
        computedNet: number;     // SUM of all transactions in DB
        principal: number;
        fbaFees: number;
        commission: number;
        refunds: number;
        taxes: number;
        shippingNet: number;
        ppcCost: number;
        otherFees: number;
        reserved: number;
        orderCount: number;
        hasDataWarning: boolean;
        missingAmount: number;
      }>;
      nextPayments: Record<string, { date: string; daysUntil: number; lastSettlementNet: number }>;
      summary: Array<{ marketplace: string; totalNet: number; totalGross: number; settlementCount: number }>;
      monthlyAdSpend: Array<{ month: string; spend: number }>;
    }>("/api/amazon/payments", params),

  settlementTransactions: (settlementId: string, params?: Record<string, string>) =>
    get<{
      orders: Array<{
        orderId: string; sku: string | null; marketplace: string;
        postedDate: string; principal: number; commission: number; fbaFee: number;
        shipping: number; vat: number; refundAmount: number; netAmount: number;
        hasRefund: boolean; lineCount: number; crossSettlements: string[];
      }>;
      nonOrderMovements: Array<{
        transactionType: string; amountType: string; amount: number;
        currency: string; postedDate: string; cnt: number;
      }>;
      pagination: { page: number; limit: number; total: number; pages: number };
      reconciliation: {
        headerTotalAmount: number | null;
        computedNet: number;
        orderNet: number;
        nonOrderNet: number;
        diff: number;
        isComplete: boolean;
        needsResync: boolean;
      };
    }>(`/api/amazon/payments/settlement/${settlementId}/transactions`, params),

  unreconciled: (params?: Record<string, string>) =>
    get<AmazonUnreconciledResponse>("/api/amazon/payments/unreconciled", params),

  forecast: () =>
    get<AmazonPaymentForecast>("/api/amazon/payments/forecast"),

  dd7Reserve: () =>
    get<{
      byMarketplace: Array<{
        marketplace: string;
        inDd7Hold: number;
        dd7Gross: number;
        pastDd7Count: number;
        pastDd7Gross: number;
        earliestRelease: string | null;
        latestRelease: string | null;
        settlementReserve: number;
      }>;
      totals: { inDd7Hold: number; dd7Gross: number; pastDd7Count: number; pastDd7Gross: number };
      amazonNotice: { title: string; detail: string; rolloutDate: string };
      note: string;
    }>("/api/amazon/payments/dd7-reserve"),
};
