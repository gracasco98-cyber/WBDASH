import type { TrafficMetric, WorkbookDocument, WorkbookRow, WorkspaceMetric } from "@/lib/api";

export interface WorkbookColumn { key: string; label: string; group: string; automatic?: boolean; width?: number; }

const labels = [
  "DATA", "NOTE LAVORAZIONI", "PREZZO DI VENDITA", "BSR", "VENDITA PR.", "VENDITE FAKE", "PPC", "FB (Click)",
  "VENDITE", "VENDITE FAKE", "TERMINE DI RICERCA", "BREVO LIST", "PPC COSTO", "PPC UNITÀ", "FB (Click)", "VINE", "REVIEW", "ORGANICO", "",
  "INCASSO", "LOGISTICA", "COMMISSIONI AMAZON", "PRODOTTO", "VENDITE FAKE", "PPC", "ANDAMENTO", "CUMULATIVO", "",
  "SESSIONI", "VISUALIZZAZIONI", "CONVERSIONE", "% DI CONV", "COSTO VENDITE FAKE", "EXTRA DIFFICOLTÀ", "COSTO CONSULENZA", "ARROTONDAMENTO", "COSTO AGENTE", "COSTO AMZ ADS", "FB ADS", "RIENTRO EX PAYOUT", "TOT. INVEST.", "VALORE DI RIENTRO",
];
const groups = [
  ...Array(4).fill("PIANIFICAZIONE"), ...Array(15).fill("ATTUALE"), ...Array(9).fill("COSTI NON IVATI"),
  ...Array(4).fill("DATI SESSIONI"), ...Array(10).fill("COSTI IVATI"),
];
const letters = Array.from({ length: 42 }, (_, index) => {
  const first = Math.floor(index / 26) - 1;
  return `${first >= 0 ? String.fromCharCode(65 + first) : ""}${String.fromCharCode(65 + (index % 26))}`;
});
const automatic = new Set(["I", "M", "N", "T", "AC", "AD", "AE", "AF", "AL"]);

export const WORKBOOK_COLUMNS: WorkbookColumn[] = letters.map((key, index) => ({
  key, label: labels[index], group: groups[index], automatic: automatic.has(key),
  width: ["B", "K"].includes(key) ? 210 : key === "A" ? 112 : 112,
}));

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createDefaultWorkbook(days = 60): WorkbookDocument {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const rows: WorkbookRow[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const value = isoDate(date);
    return { id: value, date: value, cells: { A: value } };
  });
  return { rows, hiddenColumns: [], deletedRowIds: [] };
}

export function automaticCell(
  key: string,
  row: WorkbookRow,
  metrics: Map<string, WorkspaceMetric>,
  traffic: Map<string, TrafficMetric>,
): string | number | null | undefined {
  const metric = metrics.get(row.date); const visit = traffic.get(row.date);
  if (key === "A") return row.date;
  if (key === "I") return metric?.units;
  if (key === "M" || key === "AL") return metric?.ppcSpend;
  if (key === "N") return metric?.ppcUnits;
  if (key === "T") return metric?.sales;
  if (key === "AC") return visit?.sessions;
  if (key === "AD") return visit?.pageViews;
  if (key === "AE") return metric?.units;
  if (key === "AF") return visit ? (visit.unitSessionPercentage ?? (visit.sessions ? ((metric?.units ?? 0) / visit.sessions) * 100 : null)) : undefined;
  return undefined;
}

export function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (key === "A") return new Date(`${value}T00:00:00`).toLocaleDateString("it-IT");
  if (typeof value === "number") {
    if (key === "AF") return `${value.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
    return value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  }
  return String(value);
}
