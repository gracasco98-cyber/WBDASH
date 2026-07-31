// lib/api/client.ts — base fetch wrapper, auth handling, error handling
import { getStoredAmazonAccountId } from "../amazonAccountStorage";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://192.168.1.43:3001";

export { BASE };

/**
 * Builds a full request URL, merging `params` and — when the user has an
 * Amazon account selected (see context/AmazonAccountContext.tsx) —
 * `amazonAccountId`. Centralized here so every call site (get(), and any
 * raw `fetch()` in lib/api/amazon.ts or elsewhere) automatically scopes
 * requests to the selected account without each one having to know about
 * account selection individually.
 */
export function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`${BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const accountId = getStoredAmazonAccountId();
  if (accountId && !url.searchParams.has("amazonAccountId")) {
    url.searchParams.set("amazonAccountId", accountId);
  }
  return url.toString();
}

export async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(apiUrl(path, params), { cache: "no-store", credentials: "include" });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
