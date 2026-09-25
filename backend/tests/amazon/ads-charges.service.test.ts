import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchEventsMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn(async (_prisma: unknown, events: unknown[]) => events.length));
const lastEndMock = vi.hoisted(() => vi.fn(async (): Promise<Date | null> => null));
const createJobMock = vi.hoisted(() => vi.fn(async () => "job-1"));
const finishJobMock = vi.hoisted(() => vi.fn(async () => {}));
const prismaMock = vi.hoisted(() => ({}));

vi.mock("../../src/db", () => ({ prisma: prismaMock }));
vi.mock("../../src/amazon/sp-api.service", () => ({
  fetchProductAdsPaymentEvents: fetchEventsMock,
}));
vi.mock("../../src/repositories/amazon/ppc-cycle.repo", () => ({
  upsertAdsPaymentEvents: upsertMock,
  PPC_BILLING_MARKETPLACE: "IT",
}));
vi.mock("../../src/repositories/amazon/sync-jobs.repo", () => ({
  findLatestCompletedSyncJobEnd: lastEndMock,
  createSyncJob: createJobMock,
  finishSyncJob: finishJobMock,
}));

import { parseProductAdsPaymentEvent, syncAdsPaymentEvents } from "../../src/amazon/ads-charges.service";

const money = (amount: number) => ({ CurrencyCode: "EUR", CurrencyAmount: amount });
const rawCharge = {
  postedDate: "2026-09-18T10:00:00Z",
  transactionType: "charge",
  invoiceId: "IT-INV-1",
  baseValue: money(600),
  taxValue: money(132),
  transactionValue: money(732),
};
const NOW = new Date("2026-09-25T12:00:00Z");

describe("parseProductAdsPaymentEvent", () => {
  it("maps a Finances ads payment event and keeps the original payload", () => {
    expect(parseProductAdsPaymentEvent(rawCharge)).toEqual({
      invoiceId: "IT-INV-1",
      transactionType: "charge",
      postedDate: new Date("2026-09-18T10:00:00Z"),
      baseValue: 600,
      taxValue: 132,
      transactionValue: 732,
      currency: "EUR",
      rawPayload: rawCharge,
    });
  });

  it("rejects events without invoice, date or amounts", () => {
    expect(parseProductAdsPaymentEvent({ ...rawCharge, invoiceId: undefined })).toBeNull();
    expect(parseProductAdsPaymentEvent({ ...rawCharge, postedDate: "not-a-date" })).toBeNull();
    expect(parseProductAdsPaymentEvent({ ...rawCharge, baseValue: undefined })).toBeNull();
    expect(parseProductAdsPaymentEvent(null)).toBeNull();
  });
});

describe("syncAdsPaymentEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastEndMock.mockResolvedValue(null);
    fetchEventsMock.mockResolvedValue([rawCharge, { invoiceId: "broken" }]);
  });

  it("looks back 90 days on the first sync and stores only valid events", async () => {
    const stored = await syncAdsPaymentEvents(NOW);

    expect(fetchEventsMock).toHaveBeenCalledWith(new Date("2026-06-27T12:00:00Z"));
    expect(upsertMock).toHaveBeenCalledWith(prismaMock, [expect.objectContaining({ invoiceId: "IT-INV-1" })]);
    expect(stored).toBe(1);
  });

  it("resumes three days before the end of the last successful sync", async () => {
    lastEndMock.mockResolvedValue(new Date("2026-09-25T11:30:00Z"));

    await syncAdsPaymentEvents(NOW);

    expect(lastEndMock).toHaveBeenCalledWith(prismaMock, "ads_charges");
    expect(fetchEventsMock).toHaveBeenCalledWith(new Date("2026-09-22T11:30:00Z"));
  });

  it("records the synced window and its counts as a sync job", async () => {
    await syncAdsPaymentEvents(NOW);

    expect(createJobMock).toHaveBeenCalledWith(prismaMock, {
      jobType: "ads_charges",
      marketplace: "IT",
      dateFrom: new Date("2026-06-27T12:00:00Z"),
      dateTo: NOW,
    });
    expect(finishJobMock).toHaveBeenCalledWith(prismaMock, "job-1", {
      recordsIn: 2, recordsImported: 1, recordsUpdated: 0, recordsRejected: 1,
    });
  });

  it("marks the sync job as failed and rethrows when Amazon rejects the call", async () => {
    fetchEventsMock.mockRejectedValue(new Error("[SP-API] 403"));

    await expect(syncAdsPaymentEvents(NOW)).rejects.toThrow("403");
    expect(finishJobMock).toHaveBeenCalledWith(
      prismaMock, "job-1", { recordsIn: 0, recordsImported: 0, recordsUpdated: 0, recordsRejected: 0 }, "Error: [SP-API] 403",
    );
  });
});
