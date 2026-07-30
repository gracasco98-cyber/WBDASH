import { CompareMode } from "@/context/PeriodContext";
import { DateRange } from "./periodUtils";
import { addDays, getDateFromIso, formatDateToIso } from "./periodUtils";

export interface ComparePeriod {
  from: string;
  to: string;
  label: string;
}

export function getComparePeriod(mode: CompareMode, current: DateRange): ComparePeriod | null {
  if (mode === "none") {
    return null;
  }

  const fromDate = getDateFromIso(current.from);
  const toDate = getDateFromIso(current.to);
  const daysInPeriod = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

  if (mode === "previous_period") {
    // Get the same length period before the current period
    const prevFromDate = addDays(fromDate, -(daysInPeriod + 1));
    const prevToDate = addDays(fromDate, -1);

    return {
      from: formatDateToIso(prevFromDate),
      to: formatDateToIso(prevToDate),
      label: "Periodo precedente",
    };
  }

  if (mode === "same_period_last_year") {
    // Get the same period 365 days ago
    const lastYearFromDate = addDays(fromDate, -365);
    const lastYearToDate = addDays(toDate, -365);

    return {
      from: formatDateToIso(lastYearFromDate),
      to: formatDateToIso(lastYearToDate),
      label: "Stesso periodo anno scorso",
    };
  }

  return null;
}

export function calculateVariation(current: number, previous: number): {
  absolute: number;
  percentage: number;
  isPositive: boolean;
} {
  if (previous === 0) {
    return {
      absolute: current,
      percentage: current > 0 ? 100 : -100,
      isPositive: current >= 0,
    };
  }

  const absolute = current - previous;
  const percentage = (absolute / Math.abs(previous)) * 100;

  return {
    absolute,
    percentage,
    isPositive: absolute >= 0,
  };
}

export function formatVariation(variation: { absolute: number; percentage: number; isPositive: boolean }): string {
  const sign = variation.isPositive ? "+" : "";
  return `${sign}${variation.percentage.toFixed(1)}%`;
}
