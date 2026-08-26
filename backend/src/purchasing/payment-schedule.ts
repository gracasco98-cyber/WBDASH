// purchasing/payment-schedule.ts — pure module, no Prisma import, no Date.now().
// Computes supplier payment due dates/amounts from a PaymentTerm and an anchor
// date (the receipt date of the DDT that completes an order — see
// repositories/purchasing/goods-receipts.repo.ts, the only caller).
//
// Deliberately uses ONLY getUTC*/Date.UTC(...) — never getFullYear()/getMonth()/
// getDate() without the UTC prefix. This project has a documented pre-existing
// bug class from exactly that mistake (italyDayStart() in
// amazon/utils/datetime.ts assumes the host process runs in UTC, which breaks
// on a non-UTC dev machine) — this module must not repeat it.

/**
 * Computes a single installment's due date.
 * 1. If endOfMonth, roll the anchor date forward to the last day of that month.
 * 2. Add offsetDays.
 * 3. If fixedDay is set, move to that day-of-month in the month AFTER the one
 *    the step-2 result falls in — always the next month, never the same one.
 */
export function computeDueDate(
  anchorDate: Date,
  endOfMonth: boolean,
  fixedDay: number | null,
  offsetDays: number
): Date {
  let y = anchorDate.getUTCFullYear();
  let m = anchorDate.getUTCMonth();
  let d = anchorDate.getUTCDate();

  if (endOfMonth) {
    // Day 0 of the following month = the last day of the anchor's month.
    const eom = new Date(Date.UTC(y, m + 1, 0));
    y = eom.getUTCFullYear();
    m = eom.getUTCMonth();
    d = eom.getUTCDate();
  }

  const afterOffset = new Date(Date.UTC(y, m, d + offsetDays));

  if (fixedDay !== null) {
    return new Date(Date.UTC(afterOffset.getUTCFullYear(), afterOffset.getUTCMonth() + 1, fixedDay));
  }
  return afterOffset;
}

export interface PaymentTermInstallmentForSchedule {
  installmentNumber: number;
  offsetDays: number;
  percentage: number;
}

export interface PaymentTermForSchedule {
  endOfMonth: boolean;
  fixedDay: number | null;
  installments: PaymentTermInstallmentForSchedule[];
}

export interface ScheduledInstallment {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
}

/**
 * Splits totalAmount across the payment term's installments by percentage.
 * Works in integer cents internally so the sum of returned amounts always
 * equals totalAmount exactly (the last installment, by installmentNumber,
 * absorbs any rounding remainder) rather than drifting a cent or two from
 * independently-rounded percentages.
 */
export function computePaymentSchedule(
  anchorDate: Date,
  paymentTerm: PaymentTermForSchedule,
  totalAmount: number
): ScheduledInstallment[] {
  const sorted = [...paymentTerm.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return sorted.map((inst, i) => {
    const isLast = i === sorted.length - 1;
    const cents = isLast
      ? totalCents - allocatedCents
      : Math.round(totalCents * (inst.percentage / 100));
    allocatedCents += cents;

    return {
      installmentNumber: inst.installmentNumber,
      dueDate: computeDueDate(anchorDate, paymentTerm.endOfMonth, paymentTerm.fixedDay, inst.offsetDays),
      amount: cents / 100,
    };
  });
}
