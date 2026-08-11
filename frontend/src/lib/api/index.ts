// lib/api/index.ts — public API surface; re-exports all types and the `api` object.
// Import path "@/lib/api" is preserved for all existing callers.

// Re-export the base client helpers (uncommon but available)
export { get, BASE } from "./client";

// Re-export all TypeScript interfaces / types
export type {
  Summary,
  TimePoint,
  Order,
  OrdersResponse,
  SyncState,
  ErrorLog,
  ProductPerformance,
  ProductKpis,
  ProductsResponse,
  AggregatedProductMarketplace,
  AggregatedProduct,
  AggregatedProductsResponse,
  ProductHistoryPoint,
  ChannelDailyRow,
  ChannelDailyResponse,
  HourChannelRow,
  ShopifyPeriodStats,
  ShopifyOverview,
  AmazonSummary,
  AmazonOrder,
  AmazonOrderItem,
  AmazonOrdersResponse,
  AmazonDashboardFeeBreakdown,
  AmazonDashboardInFlightRow,
  AmazonDashboardOverdueRow,
  AmazonDashboardLastSettlement,
  AmazonDashboardResponse,
  AmazonUnreconciledOrder,
  AmazonUnreconciledResponse,
  AmazonProduct,
  AmazonPLMonth,
  AmazonPLResponse,
  AmazonInventoryItem,
  AmazonFeeBreakdown,
  AmazonProductsResponse,
  AmazonProductHistoryPoint,
  AmazonCampaign,
  AmazonPpcResponse,
  AmazonPeriodStats,
  AmazonOverview,
  AmazonCogs,
  AmazonCogsPriceEntry,
  AmazonForecastFeeBreakdown,
  AmazonForecastMarketplace,
  AmazonForecastAdditionalEU,
  AmazonPaymentForecast,
  AmazonSyncJob,
  ProductPerformanceRow,
  ProductPerformanceGroup,
  ProductPerformanceResponse,
} from "./types";

// Import domain modules
import { shopify } from "./shopify";
import { amazon } from "./amazon";
import { productPerformance } from "./product-performance";
import { purchasing } from "./purchasing";
import { suppliers } from "./suppliers";
import { purchaseOrders } from "./purchase-orders";

// Compose the `api` object that all callers use via `import { api } from "@/lib/api"`
export const api = {
  // ── Shopify / stats ──────────────────────────────────────────────────────
  overview:          shopify.overview,
  summary:           shopify.summary,
  timeseries:        shopify.timeseries,
  hourChannels:      shopify.hourChannels,
  orders:            shopify.orders,
  order:             shopify.order,
  marketplaces:      shopify.marketplaces,
  syncStatus:        shopify.syncStatus,
  errors:            shopify.errors,
  triggerSync:       shopify.triggerSync,
  products:          shopify.products,
  aggregated:        shopify.aggregated,
  productHistory:    shopify.productHistory,
  channelDaily:      shopify.channelDaily,
  triggerSnapshot:   shopify.triggerSnapshot,
  triggerFullSnapshot: shopify.triggerFullSnapshot,
  testDetection:     shopify.testDetection,

  // ── Amazon ───────────────────────────────────────────────────────────────
  amazon,
  productPerformance,

  // ── Purchasing / master data ─────────────────────────────────────────────
  purchasing,
  suppliers,
  purchaseOrders,
};
