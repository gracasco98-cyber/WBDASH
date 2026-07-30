import type { ShopifyOrder } from '@prisma/client';

/**
 * Fixture dataset for Shopify KPI integration tests.
 *
 * Reference "today" used in tests: 2026-04-15 (Italy/Rome = UTC+2 in April).
 * Italy midnight on 2026-04-15 = 2026-04-14T22:00:00Z
 * Italy midnight on 2026-04-14 = 2026-04-13T22:00:00Z
 *
 * Period boundaries (for vi.useFakeTimers set to 2026-04-15T10:00:00Z):
 *   today      >= 2026-04-14T22:00:00Z
 *   yesterday  >= 2026-04-13T22:00:00Z AND < 2026-04-14T22:00:00Z
 *   last7      >= Date.now() - 7*86400000 = 2026-04-15T10:00:00Z - 604800000ms
 *               = 2026-04-08T10:00:00Z
 *               (NOTE: last7 uses raw ms, NOT Italy-aligned — LOCK-IN quirk)
 *   last30     >= 2026-03-16T10:00:00Z  (similarly raw ms)
 *
 * Expected KPIs (hand-computed, documented per test):
 *   last7 qualifying orders (#1001..#1007 — see below):
 *     Orders in range [2026-04-08T10:00:00Z, 2026-04-15T10:00:00Z):
 *       #1003 (2026-04-10): totalAmount=50,  netAmount=50
 *       #1004 (2026-04-11): totalAmount=120, netAmount=100 (refunded 20)
 *       #1005 (2026-04-12): totalAmount=200, netAmount=200
 *       #1006 (2026-04-13T23:00): totalAmount=80, netAmount=80
 *       #1007 (2026-04-14T22:30 = Italy 2026-04-15T00:30 = today): totalAmount=60, netAmount=60
 *     NOTE: #1003T is a test order → excluded
 *     NOTE: #1004C is cancelled → INCLUDED (isCancelled not filtered — LOCK-IN)
 *     last7 revenue (totalAmount) = 50+120+200+80+60 = 510
 *     last7 netRevenue = 50+100+200+80+60 = 490
 *     last7 orderCount = 5
 *     last7 AOV = 510/5 = 102
 *
 *   today (Italy 2026-04-15 = UTC >= 2026-04-14T22:00:00Z):
 *     #1007 (2026-04-14T22:30Z) — qualifies
 *     #1008 (2026-04-15T08:00Z) — qualifies
 *     today revenue = 60+150 = 210
 *     today orderCount = 2
 *
 *   yesterday (Italy 2026-04-14 = [2026-04-13T22:00Z, 2026-04-14T22:00Z)):
 *     #1005 (2026-04-12T10:00Z — Italy 2026-04-12) — NOT in yesterday
 *     #1006 (2026-04-13T23:00Z — Italy 2026-04-14T01:00) — YES
 *     yesterday revenue = 80, count = 1
 *
 *   custom 2026-04-10 to 2026-04-12 (Italy boundaries):
 *     from=2026-04-10 (Italy 00:00 = UTC 2026-04-09T22:00Z)
 *     to=2026-04-12 (Italy 23:59:59 = UTC 2026-04-12T21:59:59Z)
 *     #1003 (2026-04-10T09:00Z → Italy 11:00) — YES (>= 2026-04-09T22:00Z)
 *     #1004 (2026-04-11T14:00Z → Italy 16:00) — YES
 *     #1005 (2026-04-12T10:00Z → Italy 12:00) — YES (<= 21:59:59Z)
 *     #1009 (2026-04-12T16:00Z → Italy 18:00) — YES (<= 21:59:59Z)
 *     custom revenue = 50+120+200+30 = 400, count = 4
 *
 *   marketplace breakdown (last7 excluding test orders):
 *     REDCARE_IT:    #1003(50) + #1005(200) = 250, count=2
 *     TEMU_IT:       #1004(120), count=1
 *     BENU_FARMA:    #1006(80), count=1
 *     EBAY_IT:       #1007(60), count=1
 *     TIKTOK_SHOP:   #1008 — in "today" (within last7 since it's today), revenue=150, count=1
 *       Wait — #1008 is 2026-04-15T08:00Z, and last7 >= 2026-04-08T10:00Z, so yes it qualifies
 *     Revised last7 including #1008:
 *       revenue = 50+120+200+80+60+150 = 660
 *       netRevenue = 50+100+200+80+60+150 = 640
 *       orderCount = 6
 *       AOV = 660/6 = 110
 *
 *   LOCK-IN: isCancelled orders ARE included in KPI queries (WHERE only filters isTest=false)
 *   LOCK-IN: last7 uses Date.now()-604800000ms (not Italy-midnight-aligned)
 *   LOCK-IN: AOV = totalRevenue/orderCount (not netRevenue)
 */
export const sampleShopifyOrders: Omit<ShopifyOrder, 'id' | 'syncedAt'>[] = [
  // ── OLDER orders (outside last7 at ref time 2026-04-15T10:00:00Z) ─────────────
  {
    shopifyOrderId: 'gid://shopify/Order/1001',
    orderName: '#1001',
    createdAt:   new Date('2026-03-10T09:00:00Z'), // ~36 days ago — in last30 region
    updatedAt:   new Date('2026-03-10T09:00:00Z'),
    processedAt: new Date('2026-03-10T09:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  95,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['REDCARE_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'REDCARE_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 95,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },
  {
    shopifyOrderId: 'gid://shopify/Order/1002',
    orderName: '#1002',
    createdAt:   new Date('2026-03-25T14:30:00Z'), // ~21 days ago
    updatedAt:   new Date('2026-03-25T14:30:00Z'),
    processedAt: new Date('2026-03-25T14:30:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  500,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['TEMU_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'TEMU_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 500,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 3,
    rawData: null,
  },

  // ── WITHIN last7 (relative to 2026-04-08T10:00:00Z cutoff) ───────────────────

  // Test order — must be EXCLUDED from all KPIs
  {
    shopifyOrderId: 'gid://shopify/Order/1003T',
    orderName: '#1003T',
    createdAt:   new Date('2026-04-10T09:00:00Z'),
    updatedAt:   new Date('2026-04-10T09:00:00Z'),
    processedAt: new Date('2026-04-10T09:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  999,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['REDCARE_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'REDCARE_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 999,
    isCancelled: false,
    isTest: true,   // ← TEST order: should be excluded
    lineItemsCount: 1,
    rawData: null,
  },

  // REDCARE_IT — regular paid order, 2026-04-10
  {
    shopifyOrderId: 'gid://shopify/Order/1003',
    orderName: '#1003',
    createdAt:   new Date('2026-04-10T09:00:00Z'),
    updatedAt:   new Date('2026-04-10T09:00:00Z'),
    processedAt: new Date('2026-04-10T09:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  50,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['REDCARE_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'REDCARE_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 50,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },

  // TEMU_IT — cancelled order, 2026-04-11
  // LOCK-IN: cancelled orders are NOT filtered — they ARE included in KPIs
  {
    shopifyOrderId: 'gid://shopify/Order/1004',
    orderName: '#1004',
    createdAt:   new Date('2026-04-11T14:00:00Z'),
    updatedAt:   new Date('2026-04-11T15:00:00Z'),
    processedAt: new Date('2026-04-11T14:00:00Z'),
    cancelledAt: new Date('2026-04-11T15:00:00Z'),
    closedAt:    new Date('2026-04-11T15:00:00Z'),
    totalAmount:  120,
    currency: 'EUR',
    financialStatus: 'refunded',
    fulfillmentStatus: null,
    rawTags: ['TEMU_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'TEMU_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: true,
    refundedAmount: 20,
    netAmount: 100,
    isCancelled: true,   // ← CANCELLED — LOCK-IN: still included in KPIs
    isTest: false,
    lineItemsCount: 2,
    rawData: null,
  },

  // REDCARE_IT — regular paid order, 2026-04-12
  {
    shopifyOrderId: 'gid://shopify/Order/1005',
    orderName: '#1005',
    createdAt:   new Date('2026-04-12T10:00:00Z'),
    updatedAt:   new Date('2026-04-12T10:00:00Z'),
    processedAt: new Date('2026-04-12T10:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  200,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['REDCARE_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'REDCARE_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 200,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 2,
    rawData: null,
  },

  // BENU_FARMA — 2026-04-13T23:00Z = Italy 2026-04-14T01:00 (yesterday relative to ref-today)
  {
    shopifyOrderId: 'gid://shopify/Order/1006',
    orderName: '#1006',
    createdAt:   new Date('2026-04-13T23:00:00Z'),
    updatedAt:   new Date('2026-04-13T23:00:00Z'),
    processedAt: new Date('2026-04-13T23:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  80,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    rawTags: ['BENU_FARMA'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'BENU_FARMA',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 80,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },

  // EBAY_IT — 2026-04-14T22:30Z = Italy 2026-04-15T00:30 (today at ref time)
  {
    shopifyOrderId: 'gid://shopify/Order/1007',
    orderName: '#1007',
    createdAt:   new Date('2026-04-14T22:30:00Z'),
    updatedAt:   new Date('2026-04-14T22:30:00Z'),
    processedAt: new Date('2026-04-14T22:30:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  60,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['EBAY_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'EBAY_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 60,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },

  // TIKTOK_SHOP — 2026-04-15T08:00Z = Italy 2026-04-15T10:00 (today, within last7)
  {
    shopifyOrderId: 'gid://shopify/Order/1008',
    orderName: '#1008',
    createdAt:   new Date('2026-04-15T08:00:00Z'),
    updatedAt:   new Date('2026-04-15T08:00:00Z'),
    processedAt: new Date('2026-04-15T08:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  150,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['TIKTOK_SHOP'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'TIKTOK_SHOP',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 150,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },

  // UNCLASSIFIED — fully refunded, within last7
  {
    shopifyOrderId: 'gid://shopify/Order/1009',
    orderName: '#1009',
    createdAt:   new Date('2026-04-12T16:00:00Z'),
    updatedAt:   new Date('2026-04-13T08:00:00Z'),
    processedAt: new Date('2026-04-12T16:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  30,
    currency: 'EUR',
    financialStatus: 'refunded',
    fulfillmentStatus: null,
    rawTags: [],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'UNCLASSIFIED',
    marketplaceDetectionReason: null,
    isRefunded: true,
    refundedAmount: 30,
    netAmount: 0,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },

  // ── Empty period sentinel (outside all test windows) ─────────────────────────
  // An order very far in the past to ensure empty-period test returns zeros
  {
    shopifyOrderId: 'gid://shopify/Order/1000',
    orderName: '#1000',
    createdAt:   new Date('2025-01-01T00:00:00Z'),
    updatedAt:   new Date('2025-01-01T00:00:00Z'),
    processedAt: new Date('2025-01-01T00:00:00Z'),
    cancelledAt: null,
    closedAt:    null,
    totalAmount:  10,
    currency: 'EUR',
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    rawTags: ['REDCARE_IT'],
    sourceName: null,
    sourceIdentifier: null,
    channelDisplayName: null,
    customerCountry: 'IT',
    customerEmail: null,
    marketplaceDetected: 'REDCARE_IT',
    marketplaceDetectionReason: 'tag',
    isRefunded: false,
    refundedAmount: 0,
    netAmount: 10,
    isCancelled: false,
    isTest: false,
    lineItemsCount: 1,
    rawData: null,
  },
];
