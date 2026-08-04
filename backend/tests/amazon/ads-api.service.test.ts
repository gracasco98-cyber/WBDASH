import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;

vi.mock("../../src/amazon/token.service", () => ({
  getAdsApiToken: vi.fn(async () => "fake-token"),
  invalidateTokens: vi.fn(),
}));
vi.mock("../../src/repositories/amazon/accounts.repo", () => ({
  getAccountCredentials: vi.fn(async () => ({ adsProfileIds: { IT: "profile-1" } })),
}));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-1"),
}));

import { fetchSPAdvertisedProductReport } from "../../src/amazon/ads-api.service";
import { gzipSync } from "zlib";

describe("fetchSPAdvertisedProductReport", () => {
  beforeEach(() => {
    let call = 0;
    global.fetch = vi.fn(async (url: string, opts?: any) => {
      call++;
      if (String(url).includes("/reporting/reports") && opts?.method === "POST") {
        return new Response(JSON.stringify({ reportId: "report-abc" }), { status: 200 });
      }
      if (String(url).includes("/reporting/reports/report-abc")) {
        return new Response(JSON.stringify({ status: "COMPLETED", url: "https://example.com/report.json.gz" }), { status: 200 });
      }
      if (String(url).includes("example.com/report.json.gz")) {
        const payload = JSON.stringify([{
          campaignId: "111", adGroupId: "222",
          advertisedAsin: "B0ABC123", advertisedSku: "SKU-RSV-01",
          impressions: 100, clicks: 5, cost: 12.5, sales30d: 60, purchases30d: 3,
        }]);
        return new Response(gzipSync(Buffer.from(payload)), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;
  });

  afterEach(() => { global.fetch = originalFetch; });

  it("returns per-ASIN spend/sales rows", async () => {
    const rows = await fetchSPAdvertisedProductReport("profile-1", "2026-08-01", "2026-08-03");
    expect(rows).toEqual([{
      campaignId: "111", adGroupId: "222",
      advertisedAsin: "B0ABC123", advertisedSku: "SKU-RSV-01",
      impressions: 100, clicks: 5, spend: 12.5, sales: 60, orders: 3,
    }]);
  });
});
