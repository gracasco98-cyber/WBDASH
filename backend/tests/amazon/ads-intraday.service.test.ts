import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profilesMock = vi.hoisted(() => vi.fn());
const campaignSyncMock = vi.hoisted(() => vi.fn(async () => 1));
const productReportMock = vi.hoisted(() => vi.fn());
const productUpsertMock = vi.hoisted(() => vi.fn(async () => {}));
const prismaMock = vi.hoisted(() => ({}));

vi.mock("../../src/db", () => ({ prisma: prismaMock }));
vi.mock("../../src/amazon/ads-api.service", () => ({
  isAdsConfigured: vi.fn(async () => true),
  getConfiguredProfiles: profilesMock,
  fetchSPAdvertisedProductReport: productReportMock,
}));
vi.mock("../../src/amazon/ads-sync.service", () => ({
  syncMarketplaceDateRange: campaignSyncMock,
}));
vi.mock("../../src/repositories/amazon/ad-spend.repo", () => ({
  upsertAdvertisedProductSnapshot: productUpsertMock,
}));

import { syncAdsIntraday } from "../../src/amazon/ads-intraday.service";

describe("syncAdsIntraday", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AMAZON_ADS_SYNC_MARKETPLACES;
    profilesMock.mockResolvedValue([
      { profileId: "p-it", marketplace: "IT", countryCode: "IT", currency: "EUR" },
      { profileId: "p-de", marketplace: "DE", countryCode: "DE", currency: "EUR" },
    ]);
    productReportMock.mockResolvedValue([
      { campaignId: "C1", advertisedAsin: "B0ABC123", impressions: 100, clicks: 5, spend: 12.5, sales: 60, orders: 3 },
    ]);
  });

  afterEach(() => {
    delete process.env.AMAZON_ADS_SYNC_MARKETPLACES;
  });

  it("refreshes today's campaign and per-ASIN metrics using the Italian date", async () => {
    process.env.AMAZON_ADS_SYNC_MARKETPLACES = "IT";

    await syncAdsIntraday(new Date("2026-08-26T22:05:00Z"));

    expect(campaignSyncMock).toHaveBeenCalledWith("p-it", "IT", "2026-08-27", "2026-08-27");
    expect(productReportMock).toHaveBeenCalledWith("p-it", "2026-08-27", "2026-08-27");
    expect(productUpsertMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        marketplace: "IT",
        snapshotDate: new Date("2026-08-27T00:00:00.000Z"),
        asin: "B0ABC123",
      })
    );
  });

  it("limits scheduled reports to the configured marketplace allow-list", async () => {
    process.env.AMAZON_ADS_SYNC_MARKETPLACES = " it ";

    await syncAdsIntraday(new Date("2026-08-27T10:00:00Z"));

    expect(campaignSyncMock).toHaveBeenCalledTimes(1);
    expect(campaignSyncMock).not.toHaveBeenCalledWith("p-de", expect.anything(), expect.anything(), expect.anything());
    expect(productReportMock).toHaveBeenCalledTimes(1);
  });
});
