// lib/api/client.ts — base fetch wrapper, auth handling, error handling
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://192.168.1.43:3001";

export { BASE };

export async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthenticated");
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
