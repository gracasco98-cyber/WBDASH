// amazon/token.service.ts — LWA token cache for SP-API and Advertising API

import { TOKEN_ENDPOINT } from "./config";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let spApiCache:   CachedToken | null = null;
let spApiCacheNA: CachedToken | null = null;
let adsApiCache:  CachedToken | null = null;

async function fetchToken(clientId: string, clientSecret: string, refreshToken: string): Promise<CachedToken> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LWA token error ${res.status}: ${body}`);
  }

  const json = await res.json() as any;
  return {
    accessToken: json.access_token,
    // expires_in is typically 3600s; subtract 5 min as buffer
    expiresAt: Date.now() + (json.expires_in - 300) * 1000,
  };
}

/** Get SP-API access token (cached, auto-refreshed) */
export async function getSpApiToken(): Promise<string> {
  if (spApiCache && spApiCache.expiresAt > Date.now()) {
    return spApiCache.accessToken;
  }

  const clientId     = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_EU_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("[Amazon] Missing AMAZON_LWA_CLIENT_ID / AMAZON_LWA_CLIENT_SECRET / AMAZON_EU_REFRESH_TOKEN");
  }

  spApiCache = await fetchToken(clientId, clientSecret, refreshToken);
  console.log("[Amazon Token] SP-API token refreshed, expires in ~55 min");
  return spApiCache.accessToken;
}

/** Get SP-API access token for North America (cached, auto-refreshed) */
export async function getSpApiTokenNA(): Promise<string> {
  if (spApiCacheNA && spApiCacheNA.expiresAt > Date.now()) {
    return spApiCacheNA.accessToken;
  }

  const clientId     = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_US_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("[Amazon] Missing AMAZON_LWA_CLIENT_ID / AMAZON_LWA_CLIENT_SECRET / AMAZON_US_REFRESH_TOKEN");
  }

  spApiCacheNA = await fetchToken(clientId, clientSecret, refreshToken);
  console.log("[Amazon Token] SP-API NA token refreshed, expires in ~55 min");
  return spApiCacheNA.accessToken;
}

/** Get Advertising API access token (cached, auto-refreshed) */
export async function getAdsApiToken(): Promise<string> {
  if (adsApiCache && adsApiCache.expiresAt > Date.now()) {
    return adsApiCache.accessToken;
  }

  const clientId     = process.env.AMAZON_ADVERTISING_CLIENT_ID || process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_ADVERTISING_CLIENT_SECRET || process.env.AMAZON_LWA_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_ADVERTISING_REFRESH_TOKEN || process.env.AMAZON_EU_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("[Amazon] Missing Advertising API credentials");
  }

  adsApiCache = await fetchToken(clientId, clientSecret, refreshToken);
  console.log("[Amazon Token] Ads API token refreshed, expires in ~55 min");
  return adsApiCache.accessToken;
}

/** Invalidate cached tokens (e.g. on 401 response) */
export function invalidateTokens(): void {
  spApiCache   = null;
  spApiCacheNA = null;
  adsApiCache  = null;
}
