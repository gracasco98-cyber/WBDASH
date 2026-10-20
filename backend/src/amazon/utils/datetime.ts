// amazon/utils/datetime.ts — Shared Italy timezone helpers
// Pure functions extracted from amazon/routes.ts (no semantic changes).

// ─── Italy timezone offset (Europe/Rome rules: CEST +2 / CET +1, DST via Intl) ───────────
/** Italy's UTC offset (ms) at a given instant, from the real Europe/Rome rules (DST included). */
function italyOffsetMsAt(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  const wallClockAsUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}
/** UTC instant of Italy midnight for an Italian calendar date (month 1-12). */
function italyMidnightUtc(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  // The offset at Italy midnight can differ from the one at UTC midnight on DST days.
  const firstGuess = utcMidnight - italyOffsetMsAt(new Date(utcMidnight));
  return new Date(utcMidnight - italyOffsetMsAt(new Date(firstGuess)));
}
/** Italy's current UTC offset in hours (1 in winter, 2 in summer). */
export function italyOffsetHours(): number {
  return italyOffsetMsAt(new Date()) / 3600000;
}
export function italyOffsetMs(): number {
  return italyOffsetHours() * 3600000;
}
/**
 * Returns the UTC instant of Italy midnight of the Italian calendar day that
 * contains `date`. Independent of the server timezone: between 00:00 and 02:00
 * Italy the UTC calendar day is still the previous one, so it must not be used.
 */
export function italyDayStart(date: Date): Date {
  const [y, m, d] = italyDateString(date).split("-").map(Number);
  return italyMidnightUtc(y, m, d);
}
/**
 * Convert a "YYYY-MM-DD" string (from <input type="date">) to a UTC Date
 * anchored to Italy local midnight (start) or 23:59:59.999 (end).
 */
export function italyDateToUtc(dateStr: string, endOfDay = false): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!endOfDay) return italyMidnightUtc(y, mo, d);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return new Date(italyMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()).getTime() - 1);
}

/** Format an instant as an Italian civil-calendar date (YYYY-MM-DD). */
export function italyDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

// ─── Helper: date range ────────────────────────────────────────────────────────
export function getDateRange(filter: string, from?: string, to?: string) {
  const now = new Date();
  const offsetMs = italyOffsetMs();
  // Italy today boundaries expressed in UTC
  const todayStart = italyDayStart(now);
  const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1);

  switch (filter) {
    case "today":     return { gte: todayStart, lte: todayEnd };
    case "yesterday": {
      const yStart = new Date(todayStart.getTime() - 86400000);
      const yEnd   = new Date(todayStart.getTime() - 1);
      return { gte: yStart, lte: yEnd };
    }
    case "last7":  return { gte: new Date(Date.now() - 7  * 86400000 - offsetMs), lte: todayEnd };
    case "last14": return { gte: new Date(Date.now() - 14 * 86400000 - offsetMs), lte: todayEnd };
    case "last30": return { gte: new Date(Date.now() - 30 * 86400000 - offsetMs), lte: todayEnd };
    case "last90": return { gte: new Date(Date.now() - 90 * 86400000 - offsetMs), lte: todayEnd };
    case "month": {
      const monthStart = italyDayStart(new Date(now.getFullYear(), now.getMonth(), 1));
      return { gte: monthStart, lte: todayEnd };
    }
    case "custom": {
      // from/to are "YYYY-MM-DD" strings — convert using Italy local timezone
      // If only one date provided, treat as single-day range
      const resolvedTo = to || from;
      return {
        gte: from        ? italyDateToUtc(from,       false) : undefined,
        lte: resolvedTo  ? italyDateToUtc(resolvedTo, true)  : undefined,
      };
    }
    default:       return { gte: new Date(Date.now() - 30 * 86400000 - offsetMs), lte: todayEnd };
  }
}
