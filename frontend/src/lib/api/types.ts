// lib/api/types.ts — shared TypeScript interfaces exported from the API layer

// ─── Shopify / Stats interfaces ────────────────────────────────────────────────

export interface Summary {
  totalRevenue: number;
  netRevenue: number;
  totalRefunds: number;
  orderCount: number;
  aov: number;
  lastHour: { revenue: number; orders: number };
  byMarketplace: Record<string, { count: number; revenue: number; net: number }>;
}

export interface TimePoint {
  time: string;
  revenue: number;
  count: number;
  // Per-marketplace revenue: mp_IT, mp_DE, mp_FR, mp_ES, mp_UK, mp_SE, mp_PL
  [key: string]: string | number;
}

export interface Order {
  id: string;
  shopifyOrderId: string;
  orderName: string;
  createdAt: string;
  totalAmount: number;
  netAmount: number;
  refundedAmount: number;
  financialStatus: string;
  fulfillmentStatus: string | null;
  marketplaceDetected: string;
  marketplaceDetectionReason: string | null;
  rawTags: string[];
  sourceName: string | null;
  channelDisplayName: string | null;
  customerCountry: string | null;
  currency: string;
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncState {
  status: string;
  lastSyncAt: string | null;
  totalSynced: number;
  error: string | null;
}

export interface ErrorLog {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

export interface ProductPerformance {
  shopifyProductId: string;
  productTitle: string;
  sku: string | null;
  imageUrl: string | null;
  marketplace: string;
  unitsSold: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
  avgUnitPrice: number;
  totalDiscount: number;
}

export interface ProductKpis {
  totalGross: number;
  totalNet: number;
  totalUnits: number;
  totalRefunds: number;
  productCount: number;
}

export interface ProductsResponse {
  products: ProductPerformance[];
  kpis: ProductKpis;
}

export interface AggregatedProductMarketplace {
  mp: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface AggregatedProduct {
  ean: string | null;
  asin: string | null;
  sku: string | null;
  imageUrl: string | null;
  productTitle: string;
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  totalRefunds?: number;
  totalAdSpend?: number;
  marketplaces: AggregatedProductMarketplace[];
  sales: number;
  promo: number;
  percentRefunds: number;
  amazonFees: number;
  costOfGoods: number;
  grossProfit: number;
  netProfit: number;
  estimatedPayout: number;
  expenses: number;
  margin: number | null;
  roi: number | null;
  realAcos: number | null;
  sessionsDay: number | null;
  unitSoldSessionPct: number | null;
  shippingCosts: number | null;
}

export interface AggregatedProductsResponse {
  products: AggregatedProduct[];
  kpis: {
    totalGross: number;
    totalNet: number;
    totalUnits: number;
    totalOrders: number;
    productCount: number;
  };
  limit: number;
  total: number;
}

export interface ProductHistoryPoint {
  date: string;
  unitsSold: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
}

export interface ChannelDailyRow {
  date: string;
  marketplace: string;
  unitsSold: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
}

export interface ChannelDailyResponse {
  rows: ChannelDailyRow[];
  dates: string[];
  marketplaces: string[];
  chartData: Array<Record<string, string | number>>;
  totals: Record<string, { unitsSold: number; grossRevenue: number; netRevenue: number; orderCount: number }>;
}

export interface HourChannelRow {
  marketplace: string;
  revenue:     number;
  net:         number;
  orders:      number;
}

// ─── Shopify BI Overview types ─────────────────────────────────────────────────

export interface ShopifyPeriodStats {
  grossRevenue: number;
  netRevenue:   number;
  orderCount:   number;
  refunds:      number;
  pctChange:    number | null;
}

export interface ShopifyOverview {
  today:     ShopifyPeriodStats;
  yesterday: ShopifyPeriodStats;
  mtd:       ShopifyPeriodStats;
  forecast:  ShopifyPeriodStats;
  lastMonth: ShopifyPeriodStats;
  meta: { daysElapsed: number; daysInMonth: number };
}

// ─── Amazon interfaces ─────────────────────────────────────────────────────────

export interface AmazonSummary {
  totalRevenue: number;
  netRevenue: number;
  orderCount: number;
  unitsSold: number;
  adSpend: number;
  acos: number;
  estimatedPayout: number;
  byMarketplace: Record<string, { revenue: number; orders: number; units: number }>;
}

export interface AmazonOrder {
  id: string;
  amazonOrderId: string;
  purchaseDate: string;
  lastUpdatedDate: string;
  orderStatus: string;
  salesChannel: string;
  marketplace: string;
  fulfillmentChannel: string;
  shipCountry: string | null;
  currency: string;
  itemTotal: number;
  isBusinessOrder: boolean;
  items: AmazonOrderItem[];
  settlementId?: string | null;
  isPaid?: boolean;
  depositDate?: string | null;
}

export interface AmazonOrderItem {
  id: string;
  orderItemId: string;
  asin: string;
  sku: string | null;
  productTitle: string;
  quantityOrdered: number;
  itemPrice: number;
  itemTax: number;
  promotionDiscount: number;
  marketplace: string;
}

export interface AmazonOrdersResponse {
  orders: AmazonOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface AmazonDashboardFeeBreakdown {
  commission: number;
  fbaFee: number;
  adsCost: number;
  adsVat: number;
  dsf: number;
  storage: number;
  inbound: number;
  prep: number;
  refunds: number;
  otherCharges: number;
  commissionPct: number;
  fbaPct: number;
  adsPct: number;
}

export interface AmazonDashboardInFlightRow {
  marketplace: string;
  count: number;
  grossAmount: number;
  estNetAmount: number;
  payoutRatioPct: number;
  lastSettlementEnd: string | null;
  lastSettlementDeposit: string | null;
  feeBreakdown: AmazonDashboardFeeBreakdown;
}

export interface AmazonDashboardOverdueRow {
  marketplace: string;
  count: number;
  grossAmount: number;
}

export interface AmazonDashboardLastSettlement {
  marketplace: string;
  depositDate: string | null;
  totalAmount: number;
  endDate: string;
  nextExpected: string;
  payoutRatioPct: number;
  historicalFees: {
    commissionPct: number;
    fbaPct: number;
    adsPct: number;
    storagePct: number;
    grossSales: number;
    realPayout: number;
  };
}

export interface AmazonDashboardResponse {
  inFlight: {
    count: number;
    totalGross: number;
    totalEstNet: number;
    totalEstFees: number;
    byMarketplace: AmazonDashboardInFlightRow[];
  };
  overdue: {
    count: number;
    totalGross: number;
    byMarketplace: AmazonDashboardOverdueRow[];
  };
  lastSettlements: AmazonDashboardLastSettlement[];
  accountSummary: {
    historicalGross: number;
    historicalPayout: number;
    historicalAmazonTake: number;
    avgPayoutPct: number;
  };
}

export interface AmazonUnreconciledOrder {
  amazonOrderId: string;
  marketplace: string;
  purchaseDate: string;
  orderStatus: string;
  fulfillmentChannel: string;
  itemTotal: number;
  currency: string;
}

export interface AmazonUnreconciledResponse {
  orders: AmazonUnreconciledOrder[];
  pagination: { page: number; limit: number; total: number; pages: number };
  isCustomRange: boolean;
  customFrom: string | null;
  customTo: string | null;
  totals: Array<{ marketplace: string; count: number; amount: number; covFrom: string; covTo: string }>;
  coverageByMarketplace: Array<{ marketplace: string; covFrom: string; covTo: string; settlementCount: number }>;
}

export interface AmazonProduct {
  asin: string;
  sku: string | null;
  productTitle: string;
  marketplace: string;
  imageUrl: string | null;
  unitsSold: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
  avgUnitPrice: number;
  totalDiscount: number;
  adSpend: number;
  // COGS & profitability
  cogsPerUnit: number;
  shippingCost: number;
  vatRate: number;
  cogsTotal: number;
  estFees: number;
  estPayout: number;
  grossProfit: number;
  marginPct: number;
  hasCogs: boolean;
}

export interface AmazonPLMonth {
  month: string;
  grossRevenue: number;
  netSales: number;
  refunds: number;
  commission: number;   // referral commission from settlement
  fbaFee: number;       // FBA fulfillment fee from settlement
  ppcCost: number;      // PPC cost from settlement EU rows (real bank charge)
  otherFees: number;    // storage / other from settlement EU rows
  amazonFees: number;   // commission + fbaFee + otherFees
  adSpend: number;      // realAdSpend = ppcCost if available else AmazonAdSnapshot
  cogsTotal: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
  roi: number | null;
  orderCount: number;
  unitsSold: number;
  cancelledCount: number;
  hasRealFees: boolean;
}

export interface AmazonPLResponse {
  months: AmazonPLMonth[];
  totals: AmazonPLMonth & { roi: number | null };
}

export interface AmazonInventoryItem {
  id: string | null;
  asin: string;
  sku: string | null;
  marketplace: string;
  productTitle: string | null;
  imageUrl: string | null;
  qtyAfn: number;
  qtyMfn: number;
  qtyInbound: number;
  qtyReserved: number;
  qtyTotal: number;
  reorderPoint: number;
  reorderQty: number;
  leadTimeDays: number;
  salesVelocity: number;
  daysRemaining: number | null;
  status: "good" | "ok" | "low" | "critical" | "unknown";
  reorderNow: boolean;
}

export interface AmazonFeeBreakdown {
  type: string;
  total: number;
  count: number;
  pct: number;
}

export interface AmazonProductsResponse {
  products: AmazonProduct[];
  kpis: {
    totalGross: number;
    totalNet: number;
    totalUnits: number;
    totalRefunds: number;
    productCount: number;
  };
}

export interface AmazonProductHistoryPoint {
  date: string;
  unitsSold: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  orderCount: number;
  adSpend: number;
}

export interface AmazonCampaign {
  campaignId: string;
  campaignName: string;
  marketplace: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number | null;
  roas: number | null;
  ctr: number;
}

export interface AmazonPpcResponse {
  campaigns: AmazonCampaign[];
  totals: { spend: number; sales: number; impressions: number; clicks: number; orders: number; acos: number };
}

export interface AmazonPeriodStats {
  grossRevenue: number;
  orderCount: number;
  unitsSold: number;
  cancelledCount: number;
  adSpend: number;
  estFees: number;
  estPayout: number;
  pctChange: number | null;
}

// GET /api/amazon/accounts — never includes credentials, only what the selector needs
export interface AmazonAccountSummary {
  id: string;
  name: string;
  sellerId: string;
  region: string;
}

export interface AmazonOverview {
  today:     AmazonPeriodStats;
  yesterday: AmazonPeriodStats;
  mtd:       AmazonPeriodStats;
  forecast:  AmazonPeriodStats;
  lastMonth: AmazonPeriodStats;
  meta: { daysElapsed: number; daysInMonth: number };
}

export interface AmazonCogs {
  id: string;
  asin: string;
  sku: string | null;
  marketplace: string;
  productTitle: string | null;
  cogsPerUnit: number;
  shippingCost: number;
  vatRate: number;
  vatCategory: string | null;
  currency: string;
  imageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface AmazonCogsPriceEntry {
  id: string;
  asin: string;
  sku: string | null;
  productTitle: string | null;
  imageUrl: string | null;
  marketplace: string;
  supplier: string | null;
  purchaseDate: string;
  pricePerUnit: number;
  shippingCost: number;
  quantity: number | null;
  notes: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AmazonForecastFeeBreakdown {
  commission: number; commissionPct: number;
  fbaFee: number; fbaPct: number;
  adsCost: number; adsPct: number;
  adsVat: number;
  dsf: number;
  storage: number;
  inbound: number;
  prep: number;
  refunds: number;
  otherCharges: number;
  reimbursements: number;
}

export interface AmazonForecastMarketplace {
  marketplace: string;
  currentPeriodOrders: number;
  stragglerOrders: number;
  totalOrders: number;
  currentPeriodGross: number;
  stragglerGross: number;
  totalGross: number;
  estNetPayout: number;
  estTotalFees: number;
  // History-anchored full-cycle projection
  projectedNet: number;
  projectedGross: number;
  projectedFees: number;
  cycleCompletionPct: number;
  cycleDaysRemaining: number;
  dailyRunRate: number;
  payoutRatioPct: number;
  feeBreakdown: AmazonForecastFeeBreakdown;
  historicalGross: number;
  historicalPayout: number;
  nSettlements: number;
  periodStart: string;
  periodEnd: string;
  depositEst: string;
  daysElapsed: number;
  daysUntilDeposit: number;
  confidencePct: number;
  // Capture window (DD+7 corrected)
  captureStart: string;
  captureEnd: string;
  captureWindowDays: number;
  captureElapsedDays: number;
  captureDaysRemaining: number;
  captureCompletionPct: number;
  // Treasury: scenarios, range, confidence, split
  rangeMin: number;
  rangeMax: number;
  confidence: number;
  scenarioPessimistic: number;
  scenarioRealistic: number;
  scenarioOptimistic: number;
  payableGrossAO: number;
  deferredGrossAO: number;
  borderlineGrossAO: number;
  payableOrdersAO: number;
  deferredOrdersAO: number;
  estDeferredNet: number;
  payableCutoffDate: string;
}

export interface AmazonForecastAdditionalEU {
  marketplace: string;
  currency: string;
  avgHistoricalNet: number;
  lastCycleNet: number;
  lastEnd: string;
  lastDeposit: string;
  nextDepositEst: string;
  daysUntilDeposit: number | null;
}

export interface AmazonPaymentForecast {
  byMarketplace: AmazonForecastMarketplace[];
  totals: {
    totalOrders: number; totalGross: number; totalEstFees: number;
    totalEstNet: number;
    totalProjectedNet: number;
    totalProjectedGross: number;
    avgCycleCompletionPct: number;
    totalRangeMin: number;
    totalRangeMax: number;
    totalScenarioPessimistic: number;
    totalScenarioOptimistic: number;
    avgConfidence: number;
    totalEstDeferredNet: number;
  };
  cycle: {
    lastSettlementEnd: string;
    lastDepositDate: string;
    nextPeriodEnd: string;
    nextDepositEst: string;
    daysUntilDeposit: number;
    captureStart: string;
    captureEnd: string;
    captureWindowDays: number;
    captureElapsedDays: number;
    captureDaysRemaining: number;
    captureCompletionPct: number;
  } | null;
  additionalEU: AmazonForecastAdditionalEU[];
  note: string;
}

export interface AmazonSyncJob {
  id: string;
  jobType: string;
  marketplace: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  recordsIn: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsRejected: number;
  errorMessage: string | null;
  reportId: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ProductPerformanceRow {
  identifierId: string;
  asin: string;
  marketplace: string;
  sku: string | null;
  units: number;
  sales: number;
  promo: number;
  refundsAmount: number;
  refundsCount: number;
  refundPct: number;
  adsSpend: number | null;
  realAcos: number | null;
  amazonFees: number;
  hasRealFees: boolean;
  hasRealCogs: boolean;
  cogs: number;
  stock: number;
  /** False when the backend has no AmazonInventory row for this identifier —
   *  `stock: 0` then means "unknown", not "zero units". Rendered as "—". */
  hasStockData: boolean;
  /** False for non-Amazon channels (Shopify/Redcare/etc.): fee, COGS, gross/net
   *  profit, margin and ROI are genuinely untracked there, not estimated —
   *  rendered as "—" rather than a fabricated (fees=0) profit figure. Missing
   *  (undefined) on rows the Amazon backend doesn't set it for, treated as true. */
  costDataAvailable?: boolean;
  grossProfit: number;
  netProfit: number;
  estimatedPayout: number;
  margin: number;
  roi: number;
  avgSellingPrice: number;
  bsr: number | null;
  /** Only set for Shopify/Redcare rows (ProductsPerformanceTable's
   *  buildShopifyMarketplaceRows) — Amazon rows are imageless here and rely
   *  on the separate ASIN-keyed catalogImages lookup instead. */
  imageUrl?: string | null;
  /** Real VAT charged, summed from AmazonOrderItem.itemTax. Only set for
   *  Amazon rows — Shopify VAT isn't tracked yet (undefined there). */
  vatAmount?: number;
  /** Manually entered sales VAT rate (%) on the Amazon identifier, or null
   *  when unset / on the aggregate row (a single rate across identifiers
   *  isn't meaningful). Undefined for Shopify rows. */
  vatRate?: number | null;
}

export interface ProductPerformanceGroup {
  product: { id: string; name: string; brand: string | null };
  rows: ProductPerformanceRow[];
  aggregate: ProductPerformanceRow;
}

export interface ProductPerformanceResponse {
  groups: ProductPerformanceGroup[];
}
