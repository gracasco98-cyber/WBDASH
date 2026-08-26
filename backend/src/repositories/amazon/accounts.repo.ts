// accounts.repo.ts — Repository layer for AmazonAccount entity.
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
// Credentials are stored encrypted (utils/crypto.ts) — this is the ONLY place
// that decrypts them; callers get plaintext values back, never the *Enc columns.
import type { PrismaClient, AmazonAccount } from "@prisma/client";
import { encryptSecret, decryptSecret } from "../../utils/crypto";

export interface AmazonAccountCredentials {
  lwaClientId: string | null;
  lwaClientSecret: string | null;
  spApiRefreshToken: string | null;
  /** Optional secondary NA-region SP-API refresh token, same LWA client. Null if the account doesn't sell in NA. */
  spApiRefreshTokenNA: string | null;
  adsClientId: string | null;
  adsClientSecret: string | null;
  adsRefreshToken: string | null;
  adsProfileIds: Record<string, string>;
}

function decryptOrNull(value: string | null): string | null {
  return value ? decryptSecret(value) : null;
}

/** Decrypts the credential fields on an already-fetched AmazonAccount row. */
export function decryptCredentials(account: AmazonAccount): AmazonAccountCredentials {
  return {
    lwaClientId: account.lwaClientId,
    lwaClientSecret: decryptOrNull(account.lwaClientSecretEnc),
    spApiRefreshToken: decryptOrNull(account.spApiRefreshTokenEnc),
    spApiRefreshTokenNA: decryptOrNull(account.spApiRefreshTokenNAEnc),
    adsClientId: account.adsClientId,
    adsClientSecret: decryptOrNull(account.adsClientSecretEnc),
    adsRefreshToken: decryptOrNull(account.adsRefreshTokenEnc),
    adsProfileIds: (account.adsProfileIds as Record<string, string> | null) ?? {},
  };
}

/** Find all accounts with isActive = true, ordered by createdAt ASC. */
export async function findActiveAccounts(prisma: PrismaClient): Promise<AmazonAccount[]> {
  return prisma.amazonAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Find an account by ID. Returns null if not found (regardless of isActive). */
export async function findAccountById(
  prisma: PrismaClient,
  id: string
): Promise<AmazonAccount | null> {
  return prisma.amazonAccount.findUnique({ where: { id } });
}

/** Find an account by ID and return its decrypted credentials. Throws if not found. */
export async function getAccountCredentials(
  prisma: PrismaClient,
  amazonAccountId: string
): Promise<AmazonAccountCredentials> {
  const account = await findAccountById(prisma, amazonAccountId);
  if (!account) {
    throw new Error(`AmazonAccount ${amazonAccountId} not found`);
  }
  return decryptCredentials(account);
}

export interface CreateAmazonAccountParams {
  name: string;
  sellerId: string;
  region?: string;
  lwaClientId?: string | null;
  lwaClientSecret?: string | null;
  spApiRefreshToken?: string | null;
  spApiRefreshTokenNA?: string | null;
  adsClientId?: string | null;
  adsClientSecret?: string | null;
  adsRefreshToken?: string | null;
  adsProfileIds?: Record<string, string> | null;
}

/** Create a new AmazonAccount, encrypting any credential fields provided. */
export async function createAccount(
  prisma: PrismaClient,
  params: CreateAmazonAccountParams
): Promise<AmazonAccount> {
  return prisma.amazonAccount.create({
    data: {
      name: params.name,
      sellerId: params.sellerId,
      region: params.region ?? "EU",
      lwaClientId: params.lwaClientId ?? null,
      lwaClientSecretEnc: params.lwaClientSecret ? encryptSecret(params.lwaClientSecret) : null,
      spApiRefreshTokenEnc: params.spApiRefreshToken ? encryptSecret(params.spApiRefreshToken) : null,
      spApiRefreshTokenNAEnc: params.spApiRefreshTokenNA ? encryptSecret(params.spApiRefreshTokenNA) : null,
      adsClientId: params.adsClientId ?? null,
      adsClientSecretEnc: params.adsClientSecret ? encryptSecret(params.adsClientSecret) : null,
      adsRefreshTokenEnc: params.adsRefreshToken ? encryptSecret(params.adsRefreshToken) : null,
      adsProfileIds: params.adsProfileIds ?? undefined,
    },
  });
}

export interface UpdateAdsCredentialsParams {
  adsClientId: string;
  adsClientSecret: string;
  adsRefreshToken: string;
  adsProfileIds: Record<string, string>;
}

/** Update the Advertising API credentials on an existing account, encrypting the secret and refresh token. Throws if the account does not exist. */
export async function updateAdsCredentials(
  prisma: PrismaClient,
  accountId: string,
  params: UpdateAdsCredentialsParams
): Promise<AmazonAccount> {
  return prisma.amazonAccount.update({
    where: { id: accountId },
    data: {
      adsClientId: params.adsClientId,
      adsClientSecretEnc: encryptSecret(params.adsClientSecret),
      adsRefreshTokenEnc: encryptSecret(params.adsRefreshToken),
      adsProfileIds: params.adsProfileIds,
    },
  });
}
