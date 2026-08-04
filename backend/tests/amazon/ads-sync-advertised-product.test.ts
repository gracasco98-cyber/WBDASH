// backend/tests/amazon/ads-sync-advertised-product.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/amazon/ads-api.service", () => ({
  isAdsConfigured: vi.fn(async () => true),
  getConfiguredProfiles: vi.fn(async () => [{ profileId: "p1", marketplace: "IT", countryCode: "IT", currency: "EUR" }]),
  fetchSPAdvertisedProductReport: vi.fn(async () => [
    { campaignId: "C1", adGroupId: "AG1", advertisedAsin: "B0ABC123", advertisedSku: "SKU-1", impressions: 100, clicks: 5, spend: 12.5, sales: 60, orders: 3 },
  ]),
}));

// vi.mock factories are hoisted above regular top-level statements, so the
// referenced mock fn must itself be created via vi.hoisted() to avoid a
// temporal-dead-zone ReferenceError at import time.
const upsertMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/repositories/amazon/ad-spend.repo", () => ({
  upsertAdvertisedProductSnapshot: upsertMock,
}));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-1"),
}));
vi.mock("../../src/db", () => ({ prisma: {} }));

import { syncAdvertisedProductDaily } from "../../src/amazon/ads-sync.service";

describe("syncAdvertisedProductDaily", () => {
  beforeEach(() => { upsertMock.mockClear(); });

  it("fetches the advertised-product report for each configured profile and upserts one snapshot per ASIN+campaign", async () => {
    await syncAdvertisedProductDaily();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        marketplace: "IT", asin: "B0ABC123", campaignId: "C1", spend: 12.5, sales: 60, impressions: 100, clicks: 5, orders: 3,
      })
    );
  });

  it("does nothing when Ads is not configured", async () => {
    const adsApi = await import("../../src/amazon/ads-api.service");
    vi.mocked(adsApi.isAdsConfigured).mockResolvedValueOnce(false);
    await syncAdvertisedProductDaily();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
