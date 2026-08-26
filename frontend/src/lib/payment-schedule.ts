// lib/payment-schedule.ts — pure mirror of backend/src/purchasing/payment-schedule.ts.
// Same UTC-only logic, same rounding rules. Powers the live preview in
// PaymentTermForm.tsx. If the backend version changes, update this one too.

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

export interface PreviewInstallment { installmentNumber: number; offsetDays: number; percentage: number; }
export interface ScheduledInstallment { installmentNumber: number; dueDate: Date; amount: number; }

export function computePaymentSchedule(
  anchorDate: Date,
  term: { endOfMonth: boolean; fixedDay: number | null; installments: PreviewInstallment[] },
  totalAmount: number
): ScheduledInstallment[] {
  const sorted = [...term.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return sorted.map((inst, i) => {
    const isLast = i === sorted.length - 1;
    const cents = isLast ? totalCents - allocatedCents : Math.round(totalCents * (inst.percentage / 100));
    allocatedCents += cents;
    return {
      installmentNumber: inst.installmentNumber,
      dueDate: computeDueDate(anchorDate, term.endOfMonth, term.fixedDay, inst.offsetDays),
      amount: cents / 100,
    };
  });
}
