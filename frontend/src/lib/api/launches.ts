import { apiUrl, get } from "./client";

export interface LaunchKeywordDay {
  id: string;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  volume: number | null;
  fakeRevenue: number;
  fakeOrders: number;
  reviewCount: number;
  adsCost: number;
  note: string | null;
}

export interface LaunchDay {
  id: string;
  day: string;
  fakeRevenue: number;
  fakeOrders: number;
  reviewCount: number;
  reviewRating: number | null;
  adsCost: number;
  reviewCost: number;
  couponCost: number;
  giveawayCost: number;
  logisticsCost: number;
  otherCost: number;
  note: string | null;
  totalCost: number;
  netLaunchImpact: number;
  keywords: LaunchKeywordDay[];
}

export interface Launch {
  id: string;
  name: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  marketplace: string;
  startedOn: string;
  status: string;
  notes: string | null;
  days: LaunchDay[];
  totals: { fakeRevenue: number; launchCost: number; netImpact: number; reviews: number };
}

export interface LaunchCatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  identifiers: Array<{ asin: string | null; sku: string | null; marketplace: string }>;
}

export interface LaunchDayInput {
  fakeRevenue?: number; fakeOrders?: number; reviewCount?: number; reviewRating?: number | null;
  adsCost?: number; reviewCost?: number; couponCost?: number; giveawayCost?: number;
  logisticsCost?: number; otherCost?: number; note?: string;
}

export interface LaunchKeywordInput {
  keyword: string; position?: number | null; previousPosition?: number | null; volume?: number | null;
  fakeRevenue?: number; fakeOrders?: number; reviewCount?: number; adsCost?: number; note?: string;
}

export const launches = {
  catalog: () => get<{ products: LaunchCatalogProduct[] }>("/api/launches/catalog"),
  list: () => get<{ launches: Launch[] }>("/api/launches"),
  get: (id: string) => get<Launch>(`/api/launches/${encodeURIComponent(id)}`),
  create: (data: { name: string; productName: string; productId?: string; sku?: string; marketplace?: string; startedOn: string; notes?: string }) =>
    fetchJson<Launch>("/api/launches", "POST", data),
  saveDay: (id: string, day: string, data: LaunchDayInput) =>
    fetchJson<LaunchDay>(`/api/launches/${encodeURIComponent(id)}/days/${day}`, "PUT", data),
  saveKeyword: (id: string, day: string, data: LaunchKeywordInput) =>
    fetchJson<LaunchKeywordDay>(`/api/launches/${encodeURIComponent(id)}/days/${day}/keywords`, "PUT", data),
  summary: (params?: { from?: string; to?: string }) => get<{ fakeRevenue: number; fakeOrders: number; reviews: number; launchCost: number; days: number }>("/api/launches/summary", params),
};

async function fetchJson<T>(path: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
