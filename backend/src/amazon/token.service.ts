// amazon/token.service.ts — LWA token cache for SP-API and Advertising API
//
// Credentials are per AmazonAccount (encrypted at rest, see
// repositories/amazon/accounts.repo.ts), not global env vars anymore — the
// token cache is keyed by accountId so two accounts never share a token.
//
// KNOWN GAP: the NA-region SP-API token (getSpApiTokenNA) still reads from
// the legacy AMAZON_US_REFRESH_TOKEN env var, not from AmazonAccount. The
// current schema models one SP-API refresh token per account (one region);
// properly supporting an account that sells in both EU and NA would need a
// second encrypted token field on AmazonAccount. Out of scope for this
// migration — see docs/tech-debt.md.

import { TOKEN_ENDPOINT } from "./config";
import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";
import { getAccountCredentials } from "../repositories/amazon/accounts.repo";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const spApiCacheByAccount = new Map<string, CachedToken>();
const adsApiCacheByAccount = new Map<string, CachedToken>();
let spApiCacheNA: CachedToken | null = null;

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

/** Get SP-API access token for the current account (cached, auto-refreshed) */
export async function getSpApiToken(): Promise<string> {
  const accountId = getCurrentAccountId();
  const cached = spApiCacheByAccount.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const creds = await getAccountCredentials(prisma, accountId);
  if (!creds.lwaClientId || !creds.lwaClientSecret || !creds.spApiRefreshToken) {
    throw new Error(
      `[Amazon] AmazonAccount ${accountId} is missing LWA client id/secret or SP-API refresh token`
    );
  }

  const token = await fetchToken(creds.lwaClientId, creds.lwaClientSecret, creds.spApiRefreshToken);
  spApiCacheByAccount.set(accountId, token);
  console.log(`[Amazon Token] SP-API token refreshed for account ${accountId}, expires in ~55 min`);
  return token.accessToken;
}

/**
 * Get SP-API access token for North America (cached, auto-refreshed).
 * KNOWN GAP: still reads from the legacy global env vars — see file header.
 */
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

/** Get Advertising API access token for the current account (cached, auto-refreshed) */
export async function getAdsApiToken(): Promise<string> {
  const accountId = getCurrentAccountId();
  const cached = adsApiCacheByAccount.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const creds = await getAccountCredentials(prisma, accountId);
  const clientId     = creds.adsClientId ?? creds.lwaClientId;
  const clientSecret = creds.adsClientSecret ?? creds.lwaClientSecret;
  const refreshToken = creds.adsRefreshToken ?? creds.spApiRefreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`[Amazon] AmazonAccount ${accountId} is missing Advertising API credentials`);
  }

  const token = await fetchToken(clientId, clientSecret, refreshToken);
  adsApiCacheByAccount.set(accountId, token);
  console.log(`[Amazon Token] Ads API token refreshed for account ${accountId}, expires in ~55 min`);
  return token.accessToken;
}

/** Invalidate cached tokens for the current account (e.g. on 401 response) */
export function invalidateTokens(): void {
  const accountId = getCurrentAccountId();
  spApiCacheByAccount.delete(accountId);
  adsApiCacheByAccount.delete(accountId);
  spApiCacheNA = null;
}
