// amazon/ppc-cycle.ts — Pure ledger for the Amazon Ads threshold-billing cycle.
//
// Amazon bills Sponsored Ads when the unbilled spend reaches the threshold
// (or at month end). Charges only carry a posting day, while ad spend is
// daily, so the spend of a charge day is split with a running balance:
// whatever the previous cycle spent through the charge day beyond the billed
// amount spills into the new cycle.

export interface PpcCharge {
  invoiceId: string;
  /** Italian civil date (YYYY-MM-DD) the charge was posted on. */
  date: string;
  /** Billed amount net of VAT — comparable with Ads API spend. */
  baseAmount: number;
  /** Amount deducted from the seller balance, VAT included. */
  totalAmount: number;
}

export interface PpcSpendDay {
  /** Italian civil date (YYYY-MM-DD). */
  date: string;
  spend: number;
}

export interface PpcCycleLedger {
  accumulatedSpend: number;
  carryOver: number;
  lastCharge: PpcCharge | null;
  cycleDays: PpcSpendDay[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const sumSpend = (days: PpcSpendDay[]): number =>
  days.reduce((total, day) => total + day.spend, 0);

/** Merges charges posted on the same day, oldest first. */
function chargesByDay(charges: PpcCharge[]): PpcCharge[] {
  const byDate = new Map<string, PpcCharge>();
  for (const charge of charges) {
    const existing = byDate.get(charge.date);
    byDate.set(charge.date, existing
      ? {
          ...existing,
          baseAmount: existing.baseAmount + charge.baseAmount,
          totalAmount: existing.totalAmount + charge.totalAmount,
        }
      : charge);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The oldest charge is the anchor: its own carry-over is unknown and taken as
 * zero. Every later charge settles the spend since the previous one.
 */
export function computePpcCycle(input: {
  spend: PpcSpendDay[];
  charges: PpcCharge[];
}): PpcCycleLedger {
  const spend = [...input.spend].sort((a, b) => a.date.localeCompare(b.date));
  const charges = chargesByDay(input.charges);
  const lastCharge = charges.at(-1) ?? null;

  if (!lastCharge) {
    return {
      accumulatedSpend: round2(sumSpend(spend)),
      carryOver: 0,
      lastCharge: null,
      cycleDays: spend,
    };
  }

  let balance = 0;
  for (let i = 1; i < charges.length; i++) {
    const segment = spend.filter(
      (day) => day.date > charges[i - 1].date && day.date <= charges[i].date,
    );
    balance = Math.max(0, balance + sumSpend(segment) - charges[i].baseAmount);
  }

  const cycleDays = spend.filter((day) => day.date > lastCharge.date);
  const carryOver = round2(balance);
  return {
    accumulatedSpend: round2(carryOver + sumSpend(cycleDays)),
    carryOver,
    lastCharge: {
      ...lastCharge,
      baseAmount: round2(lastCharge.baseAmount),
      totalAmount: round2(lastCharge.totalAmount),
    },
    cycleDays,
  };
}

export interface PpcCycleSummary extends Omit<PpcCycleLedger, "cycleDays"> {
  threshold: number;
  progressPct: number;
  remaining: number;
  status: "accumulating" | "charge_expected";
  averageDailySpend7d: number;
  estimatedDaysToThreshold: number | null;
  updatedThrough: string | null;
  daily: Array<{ date: string; spend: number; cumulative: number }>;
}

const AVERAGE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * Average spend over the calendar week ending on the latest spend day; days
 * without any spend row count as zero, shorter histories use their own span.
 */
function averageDailySpend(spend: PpcSpendDay[]): number {
  const last = spend.at(-1);
  if (!last) return 0;
  const lastDay = dayNumber(last.date);
  const window = spend.filter((day) => lastDay - dayNumber(day.date) < AVERAGE_WINDOW_DAYS);
  const span = Math.min(AVERAGE_WINDOW_DAYS, lastDay - dayNumber(window[0].date) + 1);
  return round2(sumSpend(window) / span);
}

export function summarizePpcCycle(input: {
  spend: PpcSpendDay[];
  charges: PpcCharge[];
  threshold: number;
}): PpcCycleSummary {
  const spend = [...input.spend].sort((a, b) => a.date.localeCompare(b.date));
  const { cycleDays, ...ledger } = computePpcCycle({ spend, charges: input.charges });
  const { threshold } = input;
  const remaining = round2(Math.max(0, threshold - ledger.accumulatedSpend));
  const averageDailySpend7d = averageDailySpend(spend);

  let cumulative = ledger.carryOver;
  const daily = cycleDays.map((day) => {
    cumulative = round2(cumulative + day.spend);
    return { date: day.date, spend: round2(day.spend), cumulative };
  });

  return {
    ...ledger,
    threshold,
    progressPct: round1(Math.min(100, (ledger.accumulatedSpend / threshold) * 100)),
    remaining,
    status: ledger.accumulatedSpend >= threshold ? "charge_expected" : "accumulating",
    averageDailySpend7d,
    estimatedDaysToThreshold: remaining > 0 && averageDailySpend7d > 0
      ? Math.ceil(remaining / averageDailySpend7d)
      : null,
    updatedThrough: spend.at(-1)?.date ?? null,
    // The UI only needs the latest week of increments; the cumulative value
    // already covers the whole cycle.
    daily: daily.slice(-AVERAGE_WINDOW_DAYS),
  };
}
