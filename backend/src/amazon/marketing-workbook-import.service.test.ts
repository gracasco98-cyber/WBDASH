import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseMarketingWorkbook } from "./marketing-workbook-import.service";

describe("marketing workbook import", () => {
  it("imports dated A:AP launch rows and communication bullets", () => {
    const workbook = XLSX.utils.book_new();
    const launch = [["", "", "PREVISIONALI"], ["DATA", "NOTE LAVORAZIONI", "PREZZO DI VENDITA"], [], [new Date("2026-04-07T10:00:00Z"), "Inizio", 14.9]];
    const content = [["Descrizione Venavil"], [], [], ["Bullet 1"], ["Bullet 2"], ["Bullet 3"], ["Bullet 4"], ["Bullet 5"]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(launch), "Foglio1");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(content), "Foglio2");
    const parsed = parseMarketingWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "VENAVIL");
    expect(parsed.workbook.rows).toHaveLength(1);
    expect(parsed.workbook.rows[0].cells).toMatchObject({ B: "Inizio", C: 14.9 });
    expect(parsed.communication).toMatchObject({ title: "VENAVIL", description: "Descrizione Venavil", bullets: ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"] });
  });
});
