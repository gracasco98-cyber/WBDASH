"use client";

export type PeriodKey =
  | "YTD" | "QTD" | "MTD"
  | "Q1"  | "Q2"  | "Q3" | "Q4"
  | "MESE" | "CUSTOM"
  | string; // YYYY-MM for specific past month

interface PeriodRange {
  from: Date;
  to:   Date;
  label: string;
}

/**
 * Returns the date range for a given period key.
 * YYYY-MM keys select a specific month.
 * CUSTOM keys return a range of [now, now] — caller must override with customFrom/customTo.
 */
export function getPeriodDates(key: PeriodKey): PeriodRange {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth(); // 0-based

  switch (key) {
    case "ANNO":
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59), label: `Anno ${y}` };
    case "YTD":
      return { from: new Date(y, 0, 1), to: now, label: `YTD ${y}` };
    case "QTD": {
      const q = Math.floor(m / 3);
      return { from: new Date(y, q * 3, 1), to: now, label: `Q${q + 1} ${y} YTD` };
    }
    case "MTD":
      return {
        from:  new Date(y, m, 1),
        to:    now,
        label: now.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
      };
    case "Q1": return { from: new Date(y, 0, 1),  to: new Date(y, 2, 31),  label: `Q1 ${y}` };
    case "Q2": return { from: new Date(y, 3, 1),  to: new Date(y, 5, 30),  label: `Q2 ${y}` };
    case "Q3": return { from: new Date(y, 6, 1),  to: new Date(y, 8, 30),  label: `Q3 ${y}` };
    case "Q4": return { from: new Date(y, 9, 1),  to: new Date(y, 11, 31), label: `Q4 ${y}` };
    case "MESE": {
      const label = now.toLocaleDateString("it-IT", { month: "long" });
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0), label };
    }
    case "CUSTOM":
      return { from: now, to: now, label: "Periodo personalizzato" };
    default: {
      // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(key)) {
        const [yy, mm] = key.split("-").map(Number);
        const label = new Date(yy, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
        return { from: new Date(yy, mm - 1, 1), to: new Date(yy, mm, 0), label };
      }
      return { from: new Date(y, 0, 1), to: now, label: `YTD ${y}` };
    }
  }
}

interface Props {
  value: PeriodKey;
  onChange: (v: PeriodKey) => void;
}

export default function PaymentPeriodSelect({ value, onChange }: Props) {
  const now = new Date();
  const y   = now.getFullYear();

  // Last 12 months for the month selector list
  const months: { key: string; label: string }[] = [];
  for (let mo = now.getMonth(); mo >= 0; mo--) {
    const key   = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const raw   = new Date(y, mo, 1).toLocaleDateString("it-IT", { month: "long" });
    months.push({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PeriodKey)}
      className="px-2.5 py-1 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
    >
      <option value="YTD">YTD</option>
      <option value="QTD">QTD</option>
      <option value="MTD">MTD</option>
      <option value="Q1">Q1</option>
      <option value="Q2">Q2</option>
      <option value="Q3">Q3</option>
      <option value="Q4">Q4</option>
      <option value="MESE">Mese corrente</option>
      {months.map((mo) => (
        <option key={mo.key} value={mo.key}>{mo.label}</option>
      ))}
      <option value="CUSTOM">Periodo personalizzato</option>
    </select>
  );
}
