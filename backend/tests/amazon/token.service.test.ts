import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/db", () => ({ prisma: {} }));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-1"),
}));
const getAccountCredentials = vi.fn();
vi.mock("../../src/repositories/amazon/accounts.repo", () => ({
  getAccountCredentials: (...args: any[]) => getAccountCredentials(...args),
}));

import { getAdsClientId, invalidateTokens } from "../../src/amazon/token.service";

describe("getAdsClientId", () => {
  beforeEach(() => {
    getAccountCredentials.mockReset();
    invalidateTokens(); // clear cache from any previous test (same mocked account id)
  });

  it("returns adsClientId when set on the account", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: "ads-client", lwaClientId: "sp-client" });
    expect(await getAdsClientId()).toBe("ads-client");
  });

  it("falls back to lwaClientId when adsClientId is not set", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: null, lwaClientId: "sp-client" });
    expect(await getAdsClientId()).toBe("sp-client");
  });

  it("caches the result across calls", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: "ads-client", lwaClientId: null });
    await getAdsClientId();
    await getAdsClientId();
    expect(getAccountCredentials).toHaveBeenCalledTimes(1);
  });

  it("throws when neither adsClientId nor lwaClientId is set", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: null, lwaClientId: null });
    await expect(getAdsClientId()).rejects.toThrow();
  });
});
