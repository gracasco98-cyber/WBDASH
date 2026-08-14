import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { updateAdsCredentials, getAccountCredentials } from "../../../src/repositories/amazon/accounts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("accounts.repo — updateAdsCredentials", () => {
  it("encrypts and stores ads credentials on an existing account", async () => {
    const accountId = await createTestAmazonAccount(db.prisma, { name: "EU Test", sellerId: "SELLER-ADS-1" });

    await updateAdsCredentials(db.prisma, accountId, {
      adsClientId: "amzn1.application-oa2-client.test",
      adsClientSecret: "super-secret-value",
      adsRefreshToken: "Atzr|refresh-token-value",
      adsProfileIds: { IT: "111", DE: "222" },
    });

    const creds = await getAccountCredentials(db.prisma, accountId);
    expect(creds.adsClientId).toBe("amzn1.application-oa2-client.test");
    expect(creds.adsClientSecret).toBe("super-secret-value");
    expect(creds.adsRefreshToken).toBe("Atzr|refresh-token-value");
    expect(creds.adsProfileIds).toEqual({ IT: "111", DE: "222" });
  });

  it("stores ciphertext, not plaintext, for the secret fields", async () => {
    const accountId = await createTestAmazonAccount(db.prisma, { name: "EU Test 2", sellerId: "SELLER-ADS-2" });
    await updateAdsCredentials(db.prisma, accountId, {
      adsClientId: "client-id",
      adsClientSecret: "plaintext-secret",
      adsRefreshToken: "plaintext-refresh",
      adsProfileIds: {},
    });
    const row = await db.prisma.amazonAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.adsClientSecretEnc).not.toBe("plaintext-secret");
    expect(row.adsClientSecretEnc).toContain(":"); // iv:authTag:ciphertext format
    expect(row.adsRefreshTokenEnc).not.toBe("plaintext-refresh");
  });

  it("throws when the account does not exist", async () => {
    await expect(updateAdsCredentials(db.prisma, "00000000-0000-0000-0000-000000000000", {
      adsClientId: "x", adsClientSecret: "y", adsRefreshToken: "z", adsProfileIds: {},
    })).rejects.toThrow();
  });
});
