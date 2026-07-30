// amazon/utils/datetime.ts — Shared Italy timezone helpers
// Pure functions extracted from amazon/routes.ts (no semantic changes).

// ─── Italy timezone offset (UTC+2 CEST Apr-Oct, UTC+1 CET Nov-Mar) ───────────
export function italyOffsetHours(): number {
  const m = new Date().getMonth() + 1; // 1-12
  return m >= 3 && m <= 10 ? 2 : 1;
}
export function italyOffsetMs(): number {
  return italyOffsetHours() * 3600000;
}
/** Returns a Date representing Italy midnight for a given Date object */
export function italyDayStart(date: Date): Date {
  const d = new Date(date);
  const offsetH = italyOffsetHours();
  d.setHours(0 - offsetH, 0, 0, 0);
  return d;
}
/**
 * Convert a "YYYY-MM-DD" string (from <input type="date">) to a UTC Date
 * anchored to Italy local midnight (start) or 23:59:59 (end).
 */
export function italyDateToUtc(dateStr: string, endOfDay = false): Date {
  const offset = italyOffsetHours();
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (endOfDay) {
    // Italy 23:59:59 → UTC: subtract offset hours
    return new Date(Date.UTC(y, mo - 1, d, 23 - offset, 59, 59, 999));
  } else {
    // Italy 00:00:00 → UTC: -offset hours (may become previous day in UTC)
    return new Date(Date.UTC(y, mo - 1, d, -offset, 0, 0, 0));
  }
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
