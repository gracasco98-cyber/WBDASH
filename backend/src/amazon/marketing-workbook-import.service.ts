import * as XLSX from "xlsx";
import { italyDateString } from "./utils/datetime";

function columnName(index: number): string {
  let value = index + 1; let name = "";
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
  return name;
}

function excelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return italyDateString(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return italyDateString(parsed);
  }
  return null;
}

export function parseMarketingWorkbook(buffer: Buffer, productName: string) {
  const source = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: true });
  const launchSheet = source.Sheets[source.SheetNames[0]];
  if (!launchSheet) throw new Error("Il file Excel non contiene il foglio Lancio");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(launchSheet, { header: 1, defval: null, raw: true });
  const rows = matrix.slice(2).flatMap((values, index) => {
    const date = excelDate(values[0]); if (!date) return [];
    const cells: Record<string, string | number | null> = { A: date };
    values.slice(0, 42).forEach((value, column) => { if (value !== null && column > 0) cells[columnName(column)] = typeof value === "number" || typeof value === "string" ? value : String(value); });
    return [{ id: `${date}-${index}`, date, cells }];
  });
  if (!rows.length) throw new Error("Nessuna riga con data trovata nel foglio Lancio");

  const contentSheet = source.Sheets[source.SheetNames[1]];
  const content = contentSheet ? XLSX.utils.sheet_to_json<unknown[]>(contentSheet, { header: 1, defval: null, raw: true }) : [];
  const bullets = content.slice(3, 8).map((row) => String(row[0] ?? ""));
  return {
    workbook: { rows, hiddenColumns: [], deletedRowIds: [] },
    communication: {
      title: productName, bullets: [...bullets, "", "", "", "", ""].slice(0, 5),
      description: String(content[0]?.[0] ?? ""), keywords: "",
    },
    sheetNames: source.SheetNames,
  };
}
