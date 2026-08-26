import { describe, it, expect } from "vitest";
import { computeDueDate, computePaymentSchedule } from "./payment-schedule";

describe("computeDueDate", () => {
  it("plain offsetDays, no end-of-month, no fixed day", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), false, null, 30);
    expect(due.toISOString().slice(0, 10)).toBe("2026-04-04");
  });

  it("end-of-month rolls the anchor to the last day of its month before adding days", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), true, null, 0);
    expect(due.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("the approved worked example: 2026-03-05, 30 days, end-of-month on, fixed day 10 -> 2026-05-10", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), true, 10, 30);
    expect(due.toISOString().slice(0, 10)).toBe("2026-05-10");
  });

  it("fixed day always moves to the NEXT month, even if fixedDay is later in the same month as the step-2 result", () => {
    const due = computeDueDate(new Date("2026-03-05T00:00:00.000Z"), false, 20, 31);
    expect(due.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("fixed day rollover from December lands in January of the next year", () => {
    const due = computeDueDate(new Date("2026-12-15T00:00:00.000Z"), false, 10, 5);
    expect(due.toISOString().slice(0, 10)).toBe("2027-01-10");
  });
});

describe("computePaymentSchedule", () => {
  it("splits totalAmount across installments by percentage, sorted by installmentNumber", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [
        { installmentNumber: 2, offsetDays: 60, percentage: 50 },
        { installmentNumber: 1, offsetDays: 30, percentage: 50 },
      ] },
      1000
    );
    expect(schedule.map(s => s.installmentNumber)).toEqual([1, 2]);
    expect(schedule[0].amount).toBe(500);
    expect(schedule[1].amount).toBe(500);
  });

  it("the last installment absorbs any rounding remainder so the sum always equals totalAmount exactly", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [
        { installmentNumber: 1, offsetDays: 30, percentage: 33.33 },
        { installmentNumber: 2, offsetDays: 60, percentage: 33.33 },
        { installmentNumber: 3, offsetDays: 90, percentage: 33.34 },
      ] },
      100
    );
    const sumCents = schedule.reduce((s, i) => s + Math.round(i.amount * 100), 0);
    expect(sumCents).toBe(10000);
  });

  it("a single 100% installment gets the full amount on the computed due date", () => {
    const schedule = computePaymentSchedule(
      new Date("2026-03-05T00:00:00.000Z"),
      { endOfMonth: false, fixedDay: null, installments: [{ installmentNumber: 1, offsetDays: 30, percentage: 100 }] },
      305.5
    );
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(305.5);
  });
});
