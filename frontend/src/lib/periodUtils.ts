import { PeriodPreset } from "@/context/PeriodContext";

export interface DateRange {
  from: string;
  to: string;
}

export function getTodayIso(): string {
  const now = new Date();
  return formatDateToIso(now);
}

export function formatDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getDateRangeForPreset(preset: PeriodPreset): DateRange | null {
  const today = new Date();
  const todayIso = formatDateToIso(today);

  switch (preset) {
    case "today":
      return { from: todayIso, to: todayIso };

    case "yesterday":
      const yesterday = addDays(today, -1);
      const yesterdayIso = formatDateToIso(yesterday);
      return { from: yesterdayIso, to: yesterdayIso };

    case "last7":
      const sevenDaysAgo = addDays(today, -6);
      return { from: formatDateToIso(sevenDaysAgo), to: todayIso };

    case "last14":
      const fourteenDaysAgo = addDays(today, -13);
      return { from: formatDateToIso(fourteenDaysAgo), to: todayIso };

    case "last30":
      const thirtyDaysAgo = addDays(today, -29);
      return { from: formatDateToIso(thirtyDaysAgo), to: todayIso };

    default:
      return null;
  }
}

export function getPeriodLabel(preset: PeriodPreset, from?: string, to?: string): string {
  switch (preset) {
    case "today":
      return "Oggi";
    case "yesterday":
      return "Ieri";
    case "last7":
      return "Ultimi 7 giorni";
    case "last14":
      return "Ultimi 14 giorni";
    case "last30":
      return "Ultimi 30 giorni";
    case "custom":
      if (from && to) {
        return `${from} → ${to}`;
      }
      return "Range personalizzato";
    default:
      return "";
  }
}

export function getPresetFromDateRange(from: string, to: string): PeriodPreset | null {
  const today = getTodayIso();
  const yesterday = formatDateToIso(addDays(new Date(), -1));

  // Check if matches a preset
  if (from === today && to === today) return "today";
  if (from === yesterday && to === yesterday) return "yesterday";

  // Check last N days
  const fromDate = getDateFromIso(from);
  const toDate = getDateFromIso(to);
  const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 6 && to === today) return "last7";
  if (diffDays === 13 && to === today) return "last14";
  if (diffDays === 29 && to === today) return "last30";

  return null;
}
