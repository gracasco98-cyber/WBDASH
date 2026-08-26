// amazon/token.service.ts — LWA token cache for SP-API and Advertising API
//
// Credentials are per AmazonAccount (encrypted at rest, see
// repositories/amazon/accounts.repo.ts), not global env vars — the token
// cache is keyed by accountId so two accounts never share a token. An
// account can optionally hold a secondary NA-region SP-API refresh token
// (spApiRefreshTokenNA) alongside its primary one, for sellers active in
// both EU and NA under the same LWA client.

import { TOKEN_ENDPOINT } from "./config";
import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";
import { getAccountCredentials } from "../repositories/amazon/accounts.repo";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const spApiCacheByAccount = new Map<string, CachedToken>();
const spApiCacheNAByAccount = new Map<string, CachedToken>();
const adsApiCacheByAccount = new Map<string, CachedToken>();
const adsClientIdCacheByAccount = new Map<string, string>();

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
 * Get SP-API access token for North America for the current account (cached, auto-refreshed).
 * Throws if the account has no spApiRefreshTokenNA configured — check
 * `hasNACredentials()` before calling this in a loop over multiple accounts.
 */
export async function getSpApiTokenNA(): Promise<string> {
  const accountId = getCurrentAccountId();
  const cached = spApiCacheNAByAccount.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const creds = await getAccountCredentials(prisma, accountId);
  if (!creds.lwaClientId || !creds.lwaClientSecret || !creds.spApiRefreshTokenNA) {
    throw new Error(
      `[Amazon] AmazonAccount ${accountId} is missing LWA client id/secret or NA-region SP-API refresh token`
    );
  }

  const token = await fetchToken(creds.lwaClientId, creds.lwaClientSecret, creds.spApiRefreshTokenNA);
  spApiCacheNAByAccount.set(accountId, token);
  console.log(`[Amazon Token] SP-API NA token refreshed for account ${accountId}, expires in ~55 min`);
  return token.accessToken;
}

/** Whether the current account has NA-region SP-API credentials configured. */
export async function hasNACredentials(): Promise<boolean> {
  const creds = await getAccountCredentials(prisma, getCurrentAccountId());
  return !!creds.spApiRefreshTokenNA;
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

/** Get the Advertising API Client ID for the current account (cached), same fallback formula getAdsApiToken() uses for the refresh token. */
export async function getAdsClientId(): Promise<string> {
  const accountId = getCurrentAccountId();
  const cached = adsClientIdCacheByAccount.get(accountId);
  if (cached) return cached;

  const creds = await getAccountCredentials(prisma, accountId);
  const clientId = creds.adsClientId ?? creds.lwaClientId;
  if (!clientId) {
    throw new Error(`[Amazon] AmazonAccount ${accountId} is missing an Advertising API Client ID`);
  }
  adsClientIdCacheByAccount.set(accountId, clientId);
  return clientId;
}

/** Invalidate cached tokens for the current account (e.g. on 401 response) */
export function invalidateTokens(): void {
  const accountId = getCurrentAccountId();
  spApiCacheByAccount.delete(accountId);
  spApiCacheNAByAccount.delete(accountId);
  adsApiCacheByAccount.delete(accountId);
  adsClientIdCacheByAccount.delete(accountId);
}
