import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountId: "account-1",
  fetchOrderReport: vi.fn(),
  ingestOrderRows: vi.fn(),
  runAmazonSnapshotJob: vi.fn(),
}));

vi.mock("../../src/db", () => ({ prisma: {} }));
vi.mock("../../src/amazon/config", () => ({
  ALL_EU_MARKETPLACE_IDS: ["EU"],
  ALL_NA_MARKETPLACE_IDS: ["NA"],
  MARKETPLACE_IDS: {},
  MARKETPLACE_REGION: {},
  REPORT_MAX_DAYS: 30,
}));
vi.mock("../../src/amazon/sp-api.service", () => ({ fetchOrderReport: mocks.fetchOrderReport }));
vi.mock("../../src/amazon/ingest.service", () => ({
  parseTsv: vi.fn(() => []),
  ingestOrderRows: mocks.ingestOrderRows,
}));
vi.mock("../../src/amazon/snapshot.service", () => ({
  runAmazonSnapshotJob: mocks.runAmazonSnapshotJob,
  computeAllAmazonHistoricalSnapshots: vi.fn(),
}));
vi.mock("../../src/amazon/settlement.service", () => ({ syncSettlementReports: vi.fn() }));
vi.mock("../../src/amazon/ads-sync.service", () => ({
  syncAdsDaily: vi.fn(),
  syncAdsBackfill: vi.fn(),
  refreshLiveCampaignCache: vi.fn(),
  syncKeywordMetrics: vi.fn(),
  syncAdsCatchUp: vi.fn(),
  syncAdvertisedProductDaily: vi.fn(),
}));
vi.mock("../../src/amazon/ads-intraday.service", () => ({
  syncAdsCampaignIntraday: vi.fn(),
  syncAdvertisedProductIntraday: vi.fn(),
}));
vi.mock("../../src/amazon/ads-charges.service", () => ({ syncAdsPaymentEvents: vi.fn() }));
vi.mock("../../src/amazon/forecast", () => ({
  reconcileForecastSnapshots: vi.fn(),
  computeAndSaveForecasts: vi.fn(),
}));
vi.mock("../../src/sse/sse", () => ({ broadcast: vi.fn() }));
vi.mock("../../src/repositories/amazon/sync-jobs.repo", () => ({
  createSyncJob: vi.fn(async () => "job-1"),
  finishSyncJob: vi.fn(),
  countSyncJobsByStatus: vi.fn(),
}));
vi.mock("../../src/repositories/amazon/ads.repo", () => ({ countAllAdSnapshots: vi.fn() }));
vi.mock("../../src/repositories/amazon/orders.repo", () => ({
  countAllAmazonOrders: vi.fn(),
  countAllAmazonOrderItems: vi.fn(),
}));
vi.mock("../../src/repositories/amazon/product-snapshots.repo", () => ({
  countAllAmazonProductSnapshots: vi.fn(),
}));
vi.mock("../../src/repositories/amazon/accounts.repo", () => ({ findActiveAccounts: vi.fn() }));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => mocks.accountId),
  runWithAccount: vi.fn((_accountId: string, fn: () => Promise<void>) => fn()),
}));
vi.mock("../../src/amazon/token.service", () => ({ hasNACredentials: vi.fn(async () => false) }));

import { runAmazonIncrementalSync } from "../../src/amazon/sync.job";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Amazon incremental sync single-flight guard", () => {
  beforeEach(() => {
    mocks.accountId = "account-1";
    mocks.fetchOrderReport.mockReset();
    mocks.ingestOrderRows.mockReset().mockResolvedValue({
      recordsIn: 0,
      recordsImported: 0,
      recordsUpdated: 0,
      recordsRejected: 0,
    });
    mocks.runAmazonSnapshotJob.mockReset().mockResolvedValue(undefined);
  });

  it("skips a second incremental sync for the same account while the first is pending", async () => {
    const report = deferred<string>();
    mocks.fetchOrderReport.mockReturnValueOnce(report.promise).mockResolvedValue("");

    const first = runAmazonIncrementalSync();
    await vi.waitFor(() => expect(mocks.fetchOrderReport).toHaveBeenCalledTimes(1));

    await runAmazonIncrementalSync();
    expect(mocks.fetchOrderReport).toHaveBeenCalledTimes(1);

    report.resolve("");
    await first;
    await runAmazonIncrementalSync();
    expect(mocks.fetchOrderReport).toHaveBeenCalledTimes(2);
  });

  it("allows different Amazon accounts to sync independently", async () => {
    const firstReport = deferred<string>();
    const secondReport = deferred<string>();
    mocks.fetchOrderReport
      .mockReturnValueOnce(firstReport.promise)
      .mockReturnValueOnce(secondReport.promise);

    const first = runAmazonIncrementalSync();
    await vi.waitFor(() => expect(mocks.fetchOrderReport).toHaveBeenCalledTimes(1));

    mocks.accountId = "account-2";
    const second = runAmazonIncrementalSync();
    await vi.waitFor(() => expect(mocks.fetchOrderReport).toHaveBeenCalledTimes(2));

    firstReport.resolve("");
    secondReport.resolve("");
    await Promise.all([first, second]);
  });
});
