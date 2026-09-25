import { describe, it, expect } from "vitest";
import { computePpcCycle, summarizePpcCycle, type PpcCharge } from "../../src/amazon/ppc-cycle";

const charge = (date: string, baseAmount: number, invoiceId = `INV-${date}`): PpcCharge => ({
  invoiceId,
  date,
  baseAmount,
  totalAmount: baseAmount,
});

const spendDays = (entries: Array<[string, number]>) =>
  entries.map(([date, spend]) => ({ date, spend }));

describe("computePpcCycle", () => {
  it("counts every spend day when no charge is known yet", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-20", 100], ["2026-09-21", 50]]),
      charges: [],
    });

    expect(cycle.accumulatedSpend).toBe(150);
    expect(cycle.carryOver).toBe(0);
    expect(cycle.lastCharge).toBeNull();
  });

  it("starts the cycle on the day after the latest charge", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-18", 25], ["2026-09-19", 100], ["2026-09-20", 200]]),
      charges: [charge("2026-09-18", 600)],
    });

    expect(cycle.accumulatedSpend).toBe(300);
    expect(cycle.lastCharge).toMatchObject({ date: "2026-09-18", baseAmount: 600 });
    expect(cycle.cycleDays.map((day) => day.date)).toEqual(["2026-09-19", "2026-09-20"]);
  });

  it("carries the charge-day spend that exceeded the invoice into the new cycle", () => {
    const cycle = computePpcCycle({
      spend: spendDays([
        ["2026-09-02", 300],
        ["2026-09-10", 350], // threshold crossed on this day: 650 spent, 600 billed
        ["2026-09-11", 30],
      ]),
      charges: [charge("2026-09-01", 600), charge("2026-09-10", 600)],
    });

    expect(cycle.carryOver).toBe(50);
    expect(cycle.accumulatedSpend).toBe(80);
  });

  it("closes the cycle on a month-end invoice below the threshold", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-20", 150], ["2026-09-30", 100], ["2026-10-01", 40]]),
      charges: [charge("2026-09-01", 600), charge("2026-09-30", 250)],
    });

    expect(cycle.carryOver).toBe(0);
    expect(cycle.accumulatedSpend).toBe(40);
  });

  it("never lets the carried balance go negative when billed exceeds tracked spend", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-05", 500], ["2026-09-11", 20]]),
      charges: [charge("2026-09-01", 600), charge("2026-09-10", 600)],
    });

    expect(cycle.carryOver).toBe(0);
    expect(cycle.accumulatedSpend).toBe(20);
  });

  it("sums several charges posted on the same day", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-10", 1250], ["2026-09-11", 10]]),
      charges: [
        charge("2026-09-01", 600),
        charge("2026-09-10", 600, "INV-A"),
        charge("2026-09-10", 600, "INV-B"),
      ],
    });

    expect(cycle.carryOver).toBe(50);
    expect(cycle.accumulatedSpend).toBe(60);
    expect(cycle.lastCharge).toMatchObject({ date: "2026-09-10", baseAmount: 1200 });
  });

  it("does not depend on the input order", () => {
    const cycle = computePpcCycle({
      spend: spendDays([["2026-09-11", 30], ["2026-09-02", 300], ["2026-09-10", 350]]),
      charges: [charge("2026-09-10", 600), charge("2026-09-01", 600)],
    });

    expect(cycle.carryOver).toBe(50);
    expect(cycle.accumulatedSpend).toBe(80);
  });
});

describe("summarizePpcCycle", () => {
  it("scores the spend since the last charge against the threshold", () => {
    const summary = summarizePpcCycle({
      spend: spendDays([["2026-09-19", 100], ["2026-09-20", 200]]),
      charges: [charge("2026-09-18", 600)],
      threshold: 600,
    });

    expect(summary).toMatchObject({
      accumulatedSpend: 300,
      progressPct: 50,
      remaining: 300,
      status: "accumulating",
      updatedThrough: "2026-09-20",
    });
  });

  it("caps the score at 100 and flags the expected charge once the threshold is reached", () => {
    const summary = summarizePpcCycle({
      spend: spendDays([["2026-09-20", 650]]),
      charges: [],
      threshold: 600,
    });

    expect(summary.progressPct).toBe(100);
    expect(summary.remaining).toBe(0);
    expect(summary.status).toBe("charge_expected");
    expect(summary.estimatedDaysToThreshold).toBeNull();
  });

  it("estimates the days to the threshold from the last seven spend days", () => {
    const summary = summarizePpcCycle({
      spend: spendDays([
        ["2026-09-10", 999], // older than the 7-day window
        ["2026-09-12", 40], ["2026-09-13", 40], ["2026-09-14", 40], ["2026-09-15", 40],
        ["2026-09-16", 40], ["2026-09-17", 40], ["2026-09-18", 40],
      ]),
      charges: [charge("2026-09-15", 600)],
      threshold: 600,
    });

    expect(summary.accumulatedSpend).toBe(120);
    expect(summary.averageDailySpend7d).toBe(40);
    expect(summary.estimatedDaysToThreshold).toBe(12);
  });

  it("returns the last seven cycle days with a cumulative that includes the carry-over", () => {
    const summary = summarizePpcCycle({
      spend: spendDays([["2026-09-02", 300], ["2026-09-10", 350], ["2026-09-11", 30], ["2026-09-12", 20]]),
      charges: [charge("2026-09-01", 600), charge("2026-09-10", 600)],
      threshold: 600,
    });

    expect(summary.carryOver).toBe(50);
    expect(summary.daily).toEqual([
      { date: "2026-09-11", spend: 30, cumulative: 80 },
      { date: "2026-09-12", spend: 20, cumulative: 100 },
    ]);
  });
});
