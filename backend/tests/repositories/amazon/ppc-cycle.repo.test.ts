/**
 * Integration tests for ppc-cycle.repo.ts — Postgres via Testcontainers.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount, runWithAccounts } from "../../../src/context/account-context";
import {
  findPpcBillingCycles,
  upsertAdsPaymentEvents,
  type AdsPaymentEventInput,
} from "../../../src/repositories/amazon/ppc-cycle.repo";

let db: TestDb;
let accountId: string;
const NOW = new Date("2026-09-25T12:00:00Z");

beforeAll(async () => { db = await setupTestDb(); });
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

const adsEvent = (overrides: Partial<AdsPaymentEventInput> = {}): AdsPaymentEventInput => ({
  invoiceId: "INV-1",
  transactionType: "charge",
  postedDate: new Date("2026-09-18T10:00:00Z"),
  baseValue: 600,
  taxValue: 132,
  transactionValue: 732,
  currency: "EUR",
  rawPayload: { invoiceId: "INV-1" },
  ...overrides,
});

async function addSpend(date: string, spend: number, marketplace = "IT", id = accountId) {
  await db.prisma.amazonAdSnapshot.create({
    data: {
      amazonAccountId: id,
      snapshotDate: new Date(`${date}T00:00:00Z`),
      marketplace,
      campaignId: `campaign-${marketplace}-${date}`,
      campaignName: `Campaign ${date}`,
      spend,
    },
  });
}

async function addSettlementAdsFee(settlementId: string, postedDate: string, amount: number, amountType = "Cost of Advertising") {
  await db.prisma.amazonSettlementTransaction.create({
    data: {
      amazonAccountId: accountId,
      settlementId,
      transactionType: "ServiceFee",
      marketplace: "EU",
      amountType,
      amount,
      currency: "EUR",
      postedDate: new Date(postedDate),
    },
  });
}

const cyclesFor = (id = accountId) =>
  runWithAccount(id, () => findPpcBillingCycles(db.prisma, NOW));

describe("upsertAdsPaymentEvents", () => {
  it("stores each ads invoice event once, even when synced twice", async () => {
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [adsEvent()]));
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [adsEvent({ baseValue: 601 })]));

    const rows = await db.prisma.amazonAdsPaymentEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoiceId: "INV-1", baseValue: 601, transactionValue: 732 });
  });
});

describe("findPpcBillingCycles", () => {
  it("starts the cycle after the latest Finances ads charge and counts only Amazon.it spend", async () => {
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [adsEvent()]));
    await addSpend("2026-09-18", 25);
    await addSpend("2026-09-19", 100);
    await addSpend("2026-09-20", 200);
    await addSpend("2026-09-20", 500, "DE");

    const [cycle] = await cyclesFor();
    expect(cycle.accumulatedSpend).toBe(300);
    expect(cycle.progressPct).toBe(50);
    expect(cycle.lastCharge).toEqual({
      invoiceId: "INV-1", date: "2026-09-18", amount: 600, totalAmount: 732, source: "financial_events",
    });
  });

  it("reads charges posted as negative deductions with their absolute amount", async () => {
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [
      adsEvent({ invoiceId: "INV-0", postedDate: new Date("2026-09-01T10:00:00Z"), baseValue: -600, taxValue: -132, transactionValue: -732 }),
      adsEvent({ invoiceId: "INV-1", postedDate: new Date("2026-09-10T10:00:00Z"), baseValue: -600, taxValue: -132, transactionValue: -732 }),
    ]));
    await addSpend("2026-09-05", 650);
    await addSpend("2026-09-11", 30);

    const [cycle] = await cyclesFor();
    expect(cycle.carryOver).toBe(50);
    expect(cycle.accumulatedSpend).toBe(80);
    expect(cycle.lastCharge).toMatchObject({ amount: 600, totalAmount: 732 });
  });

  it("uses the Italian calendar day of the charge", async () => {
    // 23:30 UTC on the 18th is already the 19th in Rome (CEST).
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [
      adsEvent({ postedDate: new Date("2026-09-18T23:30:00Z") }),
    ]));
    await addSpend("2026-09-19", 100);
    await addSpend("2026-09-20", 40);

    const [cycle] = await cyclesFor();
    expect(cycle.lastCharge?.date).toBe("2026-09-19");
    expect(cycle.accumulatedSpend).toBe(40);
  });

  it("does not restart the cycle on an ads refund", async () => {
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [
      adsEvent(),
      adsEvent({ invoiceId: "INV-1", transactionType: "refund", postedDate: new Date("2026-09-21T10:00:00Z"), baseValue: -20, taxValue: -4.4, transactionValue: -24.4 }),
    ]));
    await addSpend("2026-09-20", 200);
    await addSpend("2026-09-22", 50);

    const [cycle] = await cyclesFor();
    expect(cycle.lastCharge?.date).toBe("2026-09-18");
    expect(cycle.accumulatedSpend).toBe(250);
  });

  it("carries the charge-day spend beyond the invoice into the new cycle", async () => {
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [
      adsEvent({ invoiceId: "INV-0", postedDate: new Date("2026-09-01T10:00:00Z") }),
      adsEvent({ invoiceId: "INV-1", postedDate: new Date("2026-09-10T10:00:00Z") }),
    ]));
    await addSpend("2026-09-05", 300);
    await addSpend("2026-09-10", 350);
    await addSpend("2026-09-11", 30);

    const [cycle] = await cyclesFor();
    expect(cycle.carryOver).toBe(50);
    expect(cycle.accumulatedSpend).toBe(80);
  });

  it("falls back to the settlement advertising fee when no Finances event is stored", async () => {
    await addSettlementAdsFee("PPC-CHARGE-1", "2026-09-18T10:00:00Z", -600);
    await addSpend("2026-09-18", 25);
    await addSpend("2026-09-19", 100);

    const [cycle] = await cyclesFor();
    expect(cycle.accumulatedSpend).toBe(100);
    expect(cycle.lastCharge).toMatchObject({ invoiceId: "PPC-CHARGE-1", date: "2026-09-18", amount: 600, source: "settlement" });
  });

  it("prefers Finances events over settlement rows once they are synced", async () => {
    await addSettlementAdsFee("PPC-OLD", "2026-09-01T10:00:00Z", -600);
    await runWithAccount(accountId, () => upsertAdsPaymentEvents(db.prisma, [adsEvent()]));
    await addSpend("2026-09-10", 300);
    await addSpend("2026-09-19", 100);

    const [cycle] = await cyclesFor();
    expect(cycle.lastCharge?.source).toBe("financial_events");
    expect(cycle.accumulatedSpend).toBe(100);
  });

  it("does not treat an unrelated service-fee tax as a PPC charge", async () => {
    await addSettlementAdsFee("NON-PPC-TAX", "2026-09-21T10:00:00Z", -22, "TaxAmount");
    await addSpend("2026-09-20", 120);

    const [cycle] = await cyclesFor();
    expect(cycle.accumulatedSpend).toBe(120);
    expect(cycle.lastCharge).toBeNull();
  });

  it("caps the score at 100 without resetting when spend crosses the threshold", async () => {
    await addSpend("2026-09-20", 650);

    const [cycle] = await cyclesFor();
    expect(cycle.progressPct).toBe(100);
    expect(cycle.remaining).toBe(0);
    expect(cycle.status).toBe("charge_expected");
  });

  it("keeps independent cycles for every selected Amazon account", async () => {
    const secondId = await createTestAmazonAccount(db.prisma, { name: "Second Account" });
    await addSpend("2026-09-24", 120);
    await addSpend("2026-09-24", 360, "IT", secondId);

    const cycles = await runWithAccounts([accountId, secondId], () => findPpcBillingCycles(db.prisma, NOW));
    expect(cycles.map(({ accountId: id, accumulatedSpend }) => ({ id, accumulatedSpend })))
      .toEqual([{ id: accountId, accumulatedSpend: 120 }, { id: secondId, accumulatedSpend: 360 }]);
    expect(cycles[1].accountName).toBe("Second Account");
  });
});
