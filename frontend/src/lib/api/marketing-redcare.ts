// lib/api/marketing-redcare.ts — Marketing / Redcare keyword position search + tracking.
import { apiUrl, get } from "./client";

export type RedcareMarket = "IT" | "DE";

export interface RedcareSearchHit {
  position: number;
  ean: string | null;
  productName: string | null;
  price: number | null;
  sellerName: string | null;
  sellerType: string | null;
  promoted: boolean | null;
  promotedByReRanking: boolean | null;
  brand: string | null;
  rating: number | null;
  ratingCount: number | null;
  inStock: boolean | null;
  category: string | null;
  sellerCount: number | null;
  imageUrl: string | null;
}

export interface RedcareSearchResult {
  market: RedcareMarket;
  keyword: string;
  nbHits: number;
  hits: RedcareSearchHit[];
}

export interface MarketingKeywordSnapshot {
  id: string;
  watchId: string;
  checkedAt: string;
  found: boolean;
  position: number | null;
  nbHits: number;
  price: number | null;
  sellerName: string | null;
  productName: string | null;
  promoted: boolean | null;
  promotedByReRanking: boolean | null;
}

export interface MarketingKeywordWatch {
  id: string;
  market: RedcareMarket;
  keyword: string;
  ean: string;
  label: string | null;
  isOwn: boolean;
  active: boolean;
  createdAt: string;
  latestSnapshot: MarketingKeywordSnapshot | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const marketingRedcare = {
  search: (market: RedcareMarket, q: string) =>
    get<RedcareSearchResult>("/api/marketing/redcare/search", { market, q }),

  createWatch: (data: { market: RedcareMarket; keyword: string; ean: string; label?: string; isOwn: boolean }) =>
    post<MarketingKeywordWatch>("/api/marketing/redcare/watches", data),

  listWatches: (filter?: { market?: RedcareMarket; keyword?: string }) =>
    get<{ watches: MarketingKeywordWatch[] }>("/api/marketing/redcare/watches", filter as Record<string, string> | undefined),

  watchHistory: (id: string, days = 30) =>
    get<{ snapshots: MarketingKeywordSnapshot[] }>(`/api/marketing/redcare/watches/${id}/history`, { days: String(days) }),

  deleteWatch: (id: string) => del(`/api/marketing/redcare/watches/${id}`),

  runNow: () => post<{ status: string }>("/api/marketing/redcare/run-now", {}),

  checkNow: (data: { market: RedcareMarket; ean: string }) =>
    post<{ checked: number; errors: number }>("/api/marketing/redcare/watches/check-now", data),
};
