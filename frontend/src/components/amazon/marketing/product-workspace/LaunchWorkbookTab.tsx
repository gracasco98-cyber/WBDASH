"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check, Database, DownloadCloud, FileSpreadsheet, History, Loader2, Plus,
  RotateCcw, Rows3, Sparkles, Trash2,
} from "lucide-react";
import type { TrafficMetric, WorkbookDocument, WorkspaceMetric } from "@/lib/api";
import { automaticCell, formatCell, WORKBOOK_COLUMNS } from "./workbook-model";

type UndoAction = { kind: "row"; value: string } | { kind: "column"; value: string };

export default function LaunchWorkbookTab({ workbook, metrics, traffic, asin, lastSyncAt, onChange, onImport }: {
  workbook: WorkbookDocument; metrics: WorkspaceMetric[]; traffic: TrafficMetric[]; asin: string | null; lastSyncAt: string | null;
  onChange: (workbook: WorkbookDocument) => void; onImport: (file: File) => Promise<void>;
}) {
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.date, item])), [metrics]);
  const trafficMap = useMemo(() => new Map(traffic.map((item) => [item.date, item])), [traffic]);
  const columns = WORKBOOK_COLUMNS.filter((column) => !workbook.hiddenColumns.includes(column.key));
  const rows = workbook.rows.filter((row) => !workbook.deletedRowIds.includes(row.id));
  const lastSync = lastSyncAt ? new Date(lastSyncAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "in attesa";

  function updateCell(rowId: string, key: string, value: string) {
    onChange({ ...workbook, rows: workbook.rows.map((row) => row.id === rowId ? { ...row, cells: { ...row.cells, [key]: value } } : row) });
  }
  function deleteSelection() {
    if (selectedRow) {
      onChange({ ...workbook, deletedRowIds: [...workbook.deletedRowIds, selectedRow] });
      setUndo((items) => [...items, { kind: "row", value: selectedRow }]); setSelectedRow(null); return;
    }
    if (selectedColumn && selectedColumn !== "A") {
      onChange({ ...workbook, hiddenColumns: [...workbook.hiddenColumns, selectedColumn] });
      setUndo((items) => [...items, { kind: "column", value: selectedColumn }]); setSelectedColumn(null);
    }
  }
  function undoLast() {
    const last = undo.at(-1); if (!last) return;
    onChange(last.kind === "row"
      ? { ...workbook, deletedRowIds: workbook.deletedRowIds.filter((id) => id !== last.value) }
      : { ...workbook, hiddenColumns: workbook.hiddenColumns.filter((key) => key !== last.value) });
    setUndo((items) => items.slice(0, -1));
  }
  function addRow() {
    const last = workbook.rows.at(-1); const date = last ? new Date(`${last.date}T12:00:00`) : new Date();
    date.setDate(date.getDate() + 1); const iso = date.toISOString().slice(0, 10);
    onChange({ ...workbook, rows: [...workbook.rows, { id: `${iso}-${Date.now()}`, date: iso, cells: { A: iso } }] });
  }
  async function importFile(file?: File) {
    if (!file) return; setImporting(true);
    try { await onImport(file); }
    finally { setImporting(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_10px_35px_rgba(15,23,42,.07)]">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet size={20}/></span>
      <div><h3 className="text-sm font-bold text-slate-900">Marketing · Analisi lancio.xlsx</h3><p className="mt-0.5 text-[10px] text-slate-500">Workbook operativo · A:AP · versionato e salvato online</p></div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">Modificabile</span>
      <div className="ml-auto flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Check size={12} className="text-emerald-600"/>Modifiche salvate</span><button className="workbook-button"><History size={13}/>Cronologia</button><input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => importFile(event.target.files?.[0])}/><button onClick={() => inputRef.current?.click()} disabled={importing} className="workbook-button font-bold text-emerald-700 disabled:opacity-40">{importing ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>}Importa Excel</button></div>
    </div>

    <div className="grid gap-2 border-b border-slate-200 bg-slate-50/80 p-3 md:grid-cols-2 xl:grid-cols-[190px_1fr_1fr_1.3fr_auto]">
      <div className="source-card"><Database size={14} className="text-slate-500"/><div><span className="block text-[9px] text-slate-400">ASIN</span><strong className="font-mono text-[10px] text-slate-800">{asin ?? "NON COLLEGATO"}</strong></div></div>
      <Source label="Vendite e unità" value="SP-API · I / T / AE" ready={!!asin}/>
      <Source label="Costo e unità PPC" value="Amazon Ads · M / N / AL" ready={metrics.length > 0}/>
      <Source label="Sessioni e conversione" value="Data Kiosk · AC:AF" ready={traffic.length > 0}/>
      <div className="flex items-center justify-end px-2 text-right"><div><div className="text-[9px] font-semibold text-slate-600">Importazione automatica giornaliera</div><div className="text-[8px] text-slate-400">Ultima: {lastSync}</div></div></div>
    </div>

    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
      <button onClick={undoLast} disabled={!undo.length} className="workbook-icon-button disabled:opacity-35" title="Annulla"><RotateCcw size={14}/></button>
      <span className="mx-1 h-5 w-px bg-slate-200"/>
      <button onClick={addRow} className="workbook-button"><Plus size={13}/>Nuova riga</button>
      <button className="workbook-button"><Plus size={13}/>Nuova colonna</button>
      <button onClick={deleteSelection} disabled={!selectedRow && !selectedColumn} className="workbook-button text-red-600 disabled:opacity-35"><Trash2 size={13}/>Elimina selezione</button>
      <span className="mx-1 h-5 w-px bg-slate-200"/>
      <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Sparkles size={13} className="text-[#98740f]"/>Le celle colorate sono compilate automaticamente dall’ASIN.</div>
      <span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500">{selectedRow ? "Riga selezionata" : selectedColumn ? `Colonna ${selectedColumn}` : "Seleziona riga o colonna"}</span>
    </div>

    <div className="max-h-[650px] overflow-auto bg-white">
      <table className="border-separate border-spacing-0 font-mono text-[10px]" style={{ minWidth: columns.reduce((sum, column) => sum + (column.width ?? 112), 46) }}>
        <thead className="sticky top-0 z-20">
          <tr><th className="sheet-corner">#</th>{columns.map((column) => <th key={column.key} className={`sheet-group ${groupClass(column.group)}`} style={{ minWidth: column.width }}>{column.group}</th>)}</tr>
          <tr><th className="sheet-corner"> </th>{columns.map((column) => <th key={column.key} onClick={() => { setSelectedColumn(column.key); setSelectedRow(null); }} className={`sheet-head ${selectedColumn === column.key ? "!bg-amber-100 !shadow-[inset_0_-2px_#98740f]" : ""}`}><span>{column.key}</span><small>{column.label || "—"}</small>{column.automatic && <DownloadCloud size={10} className="shrink-0 text-blue-600"/>}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={row.id} className="hover:bg-slate-50">
          <th onClick={() => { setSelectedRow(row.id); setSelectedColumn(null); }} className={`sheet-row ${selectedRow === row.id ? "!bg-amber-100 !text-amber-800" : ""}`}>{rowIndex + 1}</th>
          {columns.map((column) => {
            const auto = automaticCell(column.key, row, metricMap, trafficMap);
            const value = auto !== undefined ? auto : row.cells[column.key] ?? "";
            return <td key={column.key} className={`border-b border-r border-slate-200 p-0 ${column.automatic ? automaticTone(column.key) : "bg-white"}`}>
              {column.automatic || column.key === "A"
                ? <div className="flex h-8 items-center whitespace-nowrap px-2 tabular-nums text-slate-700">{formatCell(column.key, value)}</div>
                : <input value={String(value ?? "")} onChange={(event) => updateCell(row.id, column.key, event.target.value)} className="h-8 w-full min-w-0 bg-transparent px-2 text-slate-700 outline-none focus:bg-amber-50 focus:ring-2 focus:ring-inset focus:ring-[#b18a22]"/>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between border-t border-slate-300 bg-slate-100 px-3 py-2 text-[10px] text-slate-500"><span>{rows.length} righe · {columns.length} colonne visibili</span><span className="inline-flex items-center gap-1"><Rows3 size={12}/>Foglio1 · A:AP</span></div>
    <style jsx global>{`
      .workbook-button{display:inline-flex;height:30px;align-items:center;gap:.35rem;padding:0 .65rem;border:1px solid #d7dde5;border-radius:.5rem;color:#475569;background:#fff;font-size:10px;transition:.15s}.workbook-button:hover{background:#f8fafc;border-color:#aeb8c5}.workbook-icon-button{display:grid;height:30px;width:30px;place-items:center;border:1px solid #d7dde5;border-radius:.5rem;color:#475569;background:#fff}.source-card{display:flex;min-height:42px;align-items:center;gap:.55rem;border:1px solid #dbe2ea;border-radius:.65rem;background:white;padding:.45rem .65rem}.sheet-corner{position:sticky;left:0;z-index:30;min-width:46px;background:#e9eef5;color:#64748b;border-right:1px solid #b8c1cc;border-bottom:1px solid #b8c1cc}.sheet-group{height:26px;color:#475569;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;font-family:ui-sans-serif,system-ui;font-size:8px;letter-spacing:.08em;text-align:center;padding:0 7px}.sheet-head{height:48px;background:#f8fafc;color:#334155;border-right:1px solid #cbd5e1;border-bottom:1px solid #b8c1cc;padding:4px 7px;text-align:left;cursor:pointer}.sheet-head span{display:block;font-size:8px;color:#94a3b8}.sheet-head small{display:inline-block;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-sans-serif,system-ui;font-size:9px;font-weight:700}.sheet-row{position:sticky;left:0;z-index:10;background:#f1f5f9;color:#64748b;border-right:1px solid #b8c1cc;border-bottom:1px solid #cbd5e1;cursor:pointer;font-weight:600}
    `}</style>
  </section>;
}

function groupClass(group: string) {
  if (group === "PIANIFICAZIONE") return "bg-amber-50 text-amber-800";
  if (group === "ATTUALE") return "bg-emerald-50 text-emerald-800";
  if (group === "DATI SESSIONI") return "bg-blue-50 text-blue-800";
  if (group === "COSTI NON IVATI") return "bg-violet-50 text-violet-800";
  if (group === "COSTI IVATI") return "bg-rose-50 text-rose-800";
  return "bg-slate-100";
}
function automaticTone(key: string) { return ["M", "N", "AL"].includes(key) ? "bg-violet-50/70" : "bg-blue-50/70"; }
function Source({ label, value, ready }: { label: string; value: string; ready: boolean }) { return <div className="source-card"><span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-500 shadow-[0_0_0_3px_#d1fae5]" : "bg-amber-500 shadow-[0_0_0_3px_#fef3c7]"}`}/><div><div className="text-[10px] font-bold text-slate-700">{label}</div><div className="text-[8px] text-slate-400">{value}</div></div><DownloadCloud size={13} className="ml-auto text-blue-600"/></div>; }
