// lib/api/shopify.ts — Shopify / stats endpoints
import { BASE, get } from "./client";
import type {
  ShopifyOverview,
  Summary,
  TimePoint,
  HourChannelRow,
  OrdersResponse,
  Order,
  SyncState,
  ErrorLog,
  ProductsResponse,
  AggregatedProductsResponse,
  ProductHistoryPoint,
  ChannelDailyResponse,
} from "./types";

export const shopify = {
  overview: (params?: Record<string, string>) =>
    get<ShopifyOverview>("/api/stats/overview", params),

  summary: (params: Record<string, string>) =>
    get<Summary>("/api/stats/summary", params),

  timeseries: (params: Record<string, string>) =>
    get<TimePoint[]>("/api/stats/timeseries", params),

  hourChannels: (params: Record<string, string>) =>
    get<HourChannelRow[]>("/api/stats/hour-channels", params),

  orders: (params: Record<string, string>) =>
    get<OrdersResponse>("/api/stats/orders", params),

  order: (id: string) =>
    get<Order>(`/api/stats/order/${id}`),

  marketplaces: () =>
    get<Array<{ marketplaceDetected: string; _count: number }>>("/api/stats/marketplaces"),

  syncStatus: () => get<SyncState>("/api/stats/sync-status"),

  errors: () => get<ErrorLog[]>("/api/stats/errors"),

  triggerSync: (full = false) =>
    fetch(`${BASE}/api/stats/sync?full=${full}`, { method: "POST" }),

  products: (params: Record<string, string>) =>
    get<ProductsResponse>("/api/products", params),

  aggregated: (params: Record<string, string>) =>
    get<AggregatedProductsResponse>("/api/products/aggregated", params),

  productHistory: (productId: string, params: Record<string, string>) =>
    get<ProductHistoryPoint[]>(`/api/products/${encodeURIComponent(productId)}/history`, params),

  channelDaily: (params: Record<string, string>) =>
    get<ChannelDailyResponse>("/api/products/channel-daily", params),

  triggerSnapshot: () =>
    fetch(`${BASE}/api/products/snapshot`, { method: "POST" }),

  triggerFullSnapshot: () =>
    fetch(`${BASE}/api/products/snapshot/full`, { method: "POST" }),

  testDetection: (tags: string[], sourceName: string, channelDisplayName: string) =>
    fetch(`${BASE}/api/stats/test-detection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags, sourceName, channelDisplayName }),
    }).then((r) => r.json()),
};
