import { setupServer, SetupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ShopifyRawOrder } from '../../src/services/shopify.service';

/**
 * MSW server condiviso. I singoli test aggiungono handler con server.use(...).
 * Default: nessun handler — qualsiasi chiamata HTTP esterna fallisce con
 * "request not handled" (intenzionale: i test devono essere espliciti).
 */
export function createMswServer(): SetupServer {
  return setupServer();
}

// ─── Shopify GraphQL mock factories ──────────────────────────────────────────

export interface ShopifyOrdersPage {
  orders: ShopifyRawOrder[];
  hasNextPage?: boolean;
  endCursor?: string | null;
}

/**
 * Builds a GraphQL response shaped exactly like shopify.service.ts expects:
 *   data.orders.edges[].node   (for paginated list queries)
 *   data.orders.pageInfo.hasNextPage / endCursor
 *
 * The handler matches ALL POST requests to myshopify.com GraphQL endpoints.
 * Pages are served in order: first call → pages[0], second call → pages[1], etc.
 *
 * Usage:
 *   server.use(shopifyMocks.ordersPages([
 *     { orders: firstBatch, hasNextPage: true, endCursor: 'cursor-abc' },
 *     { orders: secondBatch, hasNextPage: false },
 *   ]));
 */
export const shopifyMocks = {
  /**
   * Multi-page handler: each call to the Shopify GQL endpoint pops the next page.
   * After all pages are exhausted, subsequent calls get an empty last page.
   */
  ordersPages: (pages: ShopifyOrdersPage[]) => {
    let callIndex = 0;
    return http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () => {
        const page = pages[callIndex] ?? { orders: [], hasNextPage: false };
        if (callIndex < pages.length) callIndex++;

        return HttpResponse.json({
          data: {
            orders: {
              pageInfo: {
                hasNextPage: page.hasNextPage ?? false,
                endCursor:   page.endCursor ?? null,
              },
              edges: page.orders.map((o, i) => ({
                node:   o,
                cursor: page.endCursor ?? `cursor-${i}`,
              })),
            },
          },
        });
      },
    );
  },

  /**
   * Single-page handler (convenience wrapper).
   */
  ordersList: (orders: ShopifyRawOrder[], opts?: { hasNextPage?: boolean; endCursor?: string | null }) =>
    shopifyMocks.ordersPages([{ orders, hasNextPage: opts?.hasNextPage, endCursor: opts?.endCursor }]),

  /**
   * Single-order handler used by webhooks.ts fetchOrderById(gid).
   * Matches requests whose body contains `order(id:` fragment.
   */
  singleOrder: (order: ShopifyRawOrder | null) =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () =>
        HttpResponse.json({ data: { order } }),
    ),

  /**
   * HTTP error response (non-2xx) — used to test error-handling paths.
   */
  httpError: (status: number, body = 'Shopify API Error') =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () => new HttpResponse(body, { status }),
    ),

  /**
   * GraphQL-level error (HTTP 200 + errors array) — e.g. auth failures,
   * malformed queries, or throttle responses Shopify returns as 200+errors.
   */
  graphqlErrors: (errors: Array<{ message: string }>) =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () => HttpResponse.json({ errors }),
    ),

  /**
   * Network-level failure simulation (no response at all).
   */
  networkError: () =>
    http.post(
      /myshopify\.com\/admin\/api\/.*\/graphql\.json/,
      async () => HttpResponse.error(),
    ),
};

// ─── Amazon mock factories ────────────────────────────────────────────────────
//
// Mirrors the shopifyMocks pattern.  Every handler uses a regex so it matches
// the configured endpoint regardless of minor path differences.
//
// Endpoints covered:
//   TOKEN_ENDPOINT   https://api.amazon.com/auth/o2/token
//   EU_ENDPOINT      https://sellingpartnerapi-eu.amazon.com
//   ADS_ENDPOINT     https://advertising-api-eu.amazon.com
//   Report CDN       S3-style pre-signed URL (any host, specific path prefix)

import * as zlib from 'zlib';

// Reusable token response
function tokenResponse(accessToken = 'mock_access_token') {
  return HttpResponse.json({ access_token: accessToken, expires_in: 3600 });
}

/** Build a minimal TSV string from an array of rows (first row = headers). */
function buildTsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join('\t'), ...rows.map(r => headers.map(h => r[h] ?? '').join('\t'))];
  return lines.join('\n');
}

/** Compress a string to gzip Buffer (sync) */
function gzipSync(data: string): Buffer {
  return zlib.gzipSync(Buffer.from(data, 'utf-8'));
}

/** Mirrors GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL's real column
 *  set — no `quantity-shipped` column, only `quantity` (see ingest.service.ts
 *  col() doc comment). */
export interface AmazonOrderTsvRow {
  'amazon-order-id': string;
  'purchase-date': string;
  'last-updated-date': string;
  'order-status': string;
  'sales-channel': string;
  'fulfillment-channel': string;
  'ship-country': string;
  currency: string;
  asin: string;
  sku: string;
  'product-name': string;
  quantity: string;
  'item-price': string;
  'item-tax': string;
  'item-promotion-discount': string;
  'is-business-order': string;
}

export const amazonMocks = {
  // ── LWA Token ───────────────────────────────────────────────────────────────
  /**
   * POST https://api.amazon.com/auth/o2/token  → { access_token, expires_in }
   * Call count is tracked so tests can assert how many refreshes occurred.
   */
  tokenRefresh: (accessToken = 'mock_access_token') => {
    let callCount = 0;
    const handler = http.post(
      /api\.amazon\.com\/auth\/o2\/token/,
      async () => {
        callCount++;
        return tokenResponse(accessToken);
      },
    );
    // Attach counter so tests can read it
    (handler as any).__callCount = () => callCount;
    return handler;
  },

  /** Token refresh that fails with 401 on the first call then succeeds. */
  tokenRefreshFailFirst: () => {
    let calls = 0;
    return http.post(
      /api\.amazon\.com\/auth\/o2\/token/,
      async () => {
        calls++;
        if (calls === 1) return new HttpResponse('invalid_client', { status: 400 });
        return tokenResponse();
      },
    );
  },

  // ── SP-API Reports — Order Reports flow ─────────────────────────────────────
  /**
   * Full order-report flow:
   *   POST /reports/2021-06-30/reports              → { reportId }
   *   GET  /reports/2021-06-30/reports/:id          → { processingStatus: 'DONE', reportDocumentId }
   *   GET  /reports/2021-06-30/documents/:docId     → { url }
   *   GET  <presigned-url>                          → raw TSV (gzip optional)
   *
   * `rows` is already the array of TSV row objects; this builds the TSV and serves it.
   */
  orderReportFlow: (rows: AmazonOrderTsvRow[], opts: { gzip?: boolean } = {}) => {
    const reportId  = 'mock-report-001';
    const docId     = 'mock-doc-001';
    const tsv       = buildTsv(rows as any[]);
    const body      = opts.gzip ? gzipSync(tsv) : Buffer.from(tsv);
    const cdnUrl    = 'https://mock-s3.amazon.com/reports/mock-doc-001.tsv';

    return [
      // Create report
      http.post(
        /sellingpartnerapi-eu\.amazon\.com\/reports\/2021-06-30\/reports$/,
        async () => HttpResponse.json({ reportId }),
      ),
      // Poll report status — returns DONE immediately (no IN_QUEUE phase in tests)
      http.get(
        new RegExp(`sellingpartnerapi-eu\\.amazon\\.com/reports/2021-06-30/reports/${reportId}`),
        async () => HttpResponse.json({ processingStatus: 'DONE', reportDocumentId: docId }),
      ),
      // Document metadata
      http.get(
        new RegExp(`sellingpartnerapi-eu\\.amazon\\.com/reports/2021-06-30/documents/${docId}`),
        async () => HttpResponse.json({
          url: cdnUrl,
          compressionAlgorithm: opts.gzip ? 'GZIP' : undefined,
        }),
      ),
      // Actual file download
      http.get(
        /mock-s3\.amazon\.com\/reports\//,
        async () => new HttpResponse(body, {
          status: 200,
          headers: { 'Content-Type': opts.gzip ? 'application/gzip' : 'text/plain' },
        }),
      ),
    ];
  },

  // ── SP-API Settlement Reports flow ──────────────────────────────────────────
  /**
   * Settlement report flow:
   *   GET  /reports/2021-06-30/reports?reportTypes=GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE...
   *          → { reports: [{ reportId }] }
   *   GET  /reports/2021-06-30/reports/:id       → { reportDocumentId }
   *   GET  /reports/2021-06-30/documents/:docId  → { url }
   *   GET  <presigned-url>                       → raw TSV
   *
   * `settlementRows` must include the settlement header row with settlement-id etc.
   */
  settlementReportFlow: (settlementRows: Record<string, string>[], reportId = 'mock-sett-001') => {
    const docId  = `doc-${reportId}`;
    const cdnUrl = `https://mock-s3.amazon.com/settlements/${reportId}.tsv`;
    const tsv    = buildTsv(settlementRows);

    return [
      // List settlement reports
      http.get(
        /sellingpartnerapi-eu\.amazon\.com\/reports\/2021-06-30\/reports/,
        async () => HttpResponse.json({ reports: [{ reportId }], nextToken: undefined }),
      ),
      // Report metadata  (returns documentId)
      http.get(
        new RegExp(`sellingpartnerapi-eu\\.amazon\\.com/reports/2021-06-30/reports/${reportId}$`),
        async () => HttpResponse.json({ reportDocumentId: docId }),
      ),
      // Document download URL
      http.get(
        new RegExp(`sellingpartnerapi-eu\\.amazon\\.com/reports/2021-06-30/documents/${docId}`),
        async () => HttpResponse.json({ url: cdnUrl }),
      ),
      // Actual TSV file
      http.get(
        /mock-s3\.amazon\.com\/settlements\//,
        async () => new HttpResponse(Buffer.from(tsv), {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ];
  },

  // ── SP-API 429 and 500 error responses ──────────────────────────────────────
  /** Return 429 for report creation — exercises retry logic */
  reportCreate429: () =>
    http.post(
      /sellingpartnerapi-eu\.amazon\.com\/reports\/2021-06-30\/reports$/,
      async () => new HttpResponse('QuotaExceeded', { status: 429 }),
    ),

  /** Return 500 for all SP-API requests */
  spApi500: () =>
    http.all(
      /sellingpartnerapi-eu\.amazon\.com/,
      async () => new HttpResponse('Internal Server Error', { status: 500 }),
    ),

  // ── Advertising API ──────────────────────────────────────────────────────────
  /**
   * Ads campaign listing (POST /sp/campaigns/list)
   */
  adsCampaignsList: (campaigns: Array<{ campaignId: string; name: string; state: string; budget: number }>) =>
    http.post(
      /advertising-api-eu\.amazon\.com\/sp\/campaigns\/list/,
      async () => HttpResponse.json({ campaigns }),
    ),

  /**
   * Ads keyword listing (POST /sp/keywords/list)
   */
  adsKeywordsList: (keywords: Array<{ keywordId: string; campaignId: string; adGroupId: string; keywordText: string; matchType: string; state: string; bid: number }>) =>
    http.post(
      /advertising-api-eu\.amazon\.com\/sp\/keywords\/list/,
      async () => HttpResponse.json({ keywords }),
    ),

  /**
   * Ads search term async report flow:
   *   POST /reporting/reports       → { reportId }
   *   GET  /reporting/reports/:id   → { status: 'COMPLETED', url }
   *   GET  <presigned-url>          → gzip JSON array
   */
  adsSearchTermReportFlow: (searchTermRows: Array<Record<string, any>>) => {
    const reportId = 'mock-ads-st-report';
    const cdnUrl   = 'https://mock-s3.amazon.com/ads/search-terms.json.gz';
    const json     = JSON.stringify(searchTermRows);
    const body     = gzipSync(json);

    return [
      http.post(
        /advertising-api-eu\.amazon\.com\/reporting\/reports/,
        async () => HttpResponse.json({ reportId }),
      ),
      http.get(
        new RegExp(`advertising-api-eu\\.amazon\\.com/reporting/reports/${reportId}`),
        async () => HttpResponse.json({ status: 'COMPLETED', url: cdnUrl }),
      ),
      http.get(
        /mock-s3\.amazon\.com\/ads\//,
        async () => new HttpResponse(body, {
          status: 200,
          headers: { 'Content-Type': 'application/gzip' },
        }),
      ),
    ];
  },

  /** Ads API 401 → exercises invalidateTokens path */
  adsApi401: () =>
    http.all(
      /advertising-api-eu\.amazon\.com/,
      async () => new HttpResponse('Unauthorized', { status: 401 }),
    ),
};

// ─── Mirakl mock factories ────────────────────────────────────────────────────
export const miraklMocks = {
  /** OR11 — GET /orders?order_state_codes=WAITING_ACCEPTANCE */
  newOrders: (orders: Array<Record<string, any>>) =>
    http.get(
      /mirakl\.net\/api\/orders/,
      async () => HttpResponse.json({ orders, total_count: orders.length }),
    ),

  /** OR23 — PUT /orders/:id/accept */
  acceptOrder: () =>
    http.put(
      /mirakl\.net\/api\/orders\/[^/]+\/accept/,
      async () => HttpResponse.json({}),
    ),

  /** OR24 — PUT /orders/:id/tracking */
  shipOrder: () =>
    http.put(
      /mirakl\.net\/api\/orders\/[^/]+\/tracking/,
      async () => HttpResponse.json({}),
    ),

  /** Generic non-2xx error for any Mirakl endpoint */
  httpError: (status: number, body = "Mirakl API Error") =>
    http.all(
      /mirakl\.net\/api\//,
      async () => new HttpResponse(body, { status }),
    ),
};

// Re-export per i test
export { http, HttpResponse };
