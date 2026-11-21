"use client";
import { useMemo, useRef, useState } from "react";
import { Database, FileSpreadsheet, Loader2, Plus, RotateCcw, Rows3, Sparkles, Trash2 } from "lucide-react";
import type { TrafficMetric, WorkbookDocument, WorkspaceMetric } from "@/lib/api";
import { automaticCell, formatCell, WORKBOOK_COLUMNS } from "./workbook-model";

type UndoAction = { kind: "row"; value: string } | { kind: "column"; value: string };

export default function LaunchWorkbookTab({ workbook, metrics, traffic, asin, onChange, onImport }: {
  workbook: WorkbookDocument; metrics: WorkspaceMetric[]; traffic: TrafficMetric[]; asin: string | null;
  onChange: (workbook: WorkbookDocument) => void; onImport: (file: File) => Promise<void>;
}) {
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction[]>([]);
  const [importing, setImporting] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.date, item])), [metrics]);
  const trafficMap = useMemo(() => new Map(traffic.map((item) => [item.date, item])), [traffic]);
  const columns = WORKBOOK_COLUMNS.filter((column) => !workbook.hiddenColumns.includes(column.key));
  const rows = workbook.rows.filter((row) => !workbook.deletedRowIds.includes(row.id));

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
  async function importFile(file?: File) { if (!file) return; setImporting(true); try { await onImport(file); } finally { setImporting(false); if (inputRef.current) inputRef.current.value = ""; } }

  return <div className="space-y-3">
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border p-3">
        <div><h2 className="text-sm font-semibold text-zinc-100">Analisi lancio</h2><p className="text-[11px] text-zinc-500">Foglio operativo precompilato · modifiche salvate automaticamente</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => importFile(event.target.files?.[0])}/>
          <button onClick={() => inputRef.current?.click()} disabled={importing} className="tool-button text-emerald-300 disabled:opacity-40">{importing ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>} Importa Excel</button>
          <button onClick={addRow} className="tool-button"><Plus size={13}/> Riga</button>
          <button onClick={deleteSelection} disabled={!selectedRow && !selectedColumn} className="tool-button text-red-300 disabled:opacity-40"><Trash2 size={13}/> Elimina selezione</button>
          <button onClick={undoLast} disabled={!undo.length} className="tool-button disabled:opacity-40"><RotateCcw size={13}/> Annulla</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 border-b border-bg-border bg-bg-hover/30">
        <Source label="Vendite e unità" value={`Ordini SP-API · ${asin ?? "ASIN mancante"}`} ready={!!asin}/>
        <Source label="PPC costo e unità" value="Amazon Ads · report per ASIN" ready={!!asin}/>
        <Source label="Sessioni e conversione" value={traffic.length ? "Data Kiosk · aggiornato" : "Data Kiosk · in attesa sync"} ready={traffic.length > 0}/>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border text-[11px] text-zinc-500">
        <Sparkles size={13} className="text-accent-amber"/> Le celle con sfondo ambra sono automatiche e vengono aggiornate ogni giorno dall’ASIN.
      </div>
      <div className="max-h-[650px] overflow-auto">
        <table className="border-separate border-spacing-0 text-[11px]" style={{ minWidth: columns.reduce((sum, column) => sum + (column.width ?? 112), 46) }}>
          <thead className="sticky top-0 z-20">
            <tr><th className="sheet-corner">#</th>{columns.map((column) => <th key={column.key} className="sheet-group" style={{ minWidth: column.width }}>{column.group}</th>)}</tr>
            <tr><th className="sheet-corner"> </th>{columns.map((column) => <th key={column.key} onClick={() => { setSelectedColumn(column.key); setSelectedRow(null); }} className={`sheet-head ${selectedColumn === column.key ? "!bg-accent-amber/30" : ""}`}><span>{column.key}</span><small>{column.label || "—"}</small>{column.automatic && <Database size={10} className="text-accent-amber shrink-0"/>}</th>)}</tr>
          </thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={row.id}>
            <th onClick={() => { setSelectedRow(row.id); setSelectedColumn(null); }} className={`sheet-row ${selectedRow === row.id ? "!bg-accent-amber/25" : ""}`}>{rowIndex + 1}</th>
            {columns.map((column) => {
              const auto = automaticCell(column.key, row, metricMap, trafficMap);
              const value = auto !== undefined ? auto : row.cells[column.key] ?? "";
              return <td key={column.key} className={`border-r border-b border-bg-border p-0 ${column.automatic ? "bg-accent-amber/[.06]" : "bg-bg-card"}`}>
                {column.automatic || column.key === "A"
                  ? <div className="h-8 px-2 flex items-center tabular-nums text-zinc-300 whitespace-nowrap">{formatCell(column.key, value)}</div>
                  : <input value={String(value ?? "")} onChange={(event) => updateCell(row.id, column.key, event.target.value)} className="h-8 w-full min-w-0 bg-transparent px-2 text-zinc-300 outline-none focus:ring-1 focus:ring-inset focus:ring-accent-amber"/>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-bg-border px-3 py-2 text-[10px] text-zinc-500"><span>{rows.length} righe · {columns.length} colonne visibili</span><span className="inline-flex items-center gap-1"><Rows3 size={12}/> Foglio1 · A:AP</span></div>
    </div>
    <style jsx global>{`.tool-button{display:inline-flex;align-items:center;gap:.35rem;padding:.42rem .65rem;border:1px solid var(--bg-border);border-radius:.5rem;color:#a1a1aa;background:var(--bg-hover);font-size:11px}.sheet-corner{position:sticky;left:0;z-index:30;min-width:46px;background:#18181b;border-right:1px solid #303036;border-bottom:1px solid #303036}.sheet-group{height:24px;background:#222226;color:#71717a;border-right:1px solid #303036;border-bottom:1px solid #303036;font-size:9px;letter-spacing:.05em;text-align:left;padding:0 8px}.sheet-head{height:42px;background:#202024;color:#d4d4d8;border-right:1px solid #303036;border-bottom:1px solid #303036;padding:4px 7px;text-align:left;cursor:pointer}.sheet-head span{display:block;font-size:9px;color:#71717a}.sheet-head small{display:inline-block;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sheet-row{position:sticky;left:0;z-index:10;background:#202024;color:#71717a;border-right:1px solid #303036;border-bottom:1px solid #303036;cursor:pointer;font-weight:500}`}</style>
  </div>;
}

function Source({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return <div className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2"><span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`}/><div><div className="text-[10px] font-semibold text-zinc-300">{label}</div><div className="text-[9px] text-zinc-500">{value}</div></div></div>;
}
