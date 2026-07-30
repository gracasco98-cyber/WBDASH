"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api, AmazonSyncJob } from "@/lib/api";
import { fmtNum } from "@/lib/fmt";
import {
  RefreshCw, Play, CheckCircle, XCircle, Clock, Loader,
  Database, TrendingUp, BarChart2, FileText, Package,
  AlertTriangle, Zap, Shield, ChevronDown, ChevronRight,
} from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface FullSyncProgress {
  phase: string; step: string; pct: number; detail: string;
  running: boolean; error: string | null;
}
interface DbStats {
  tables: {
    amazonOrder:           { rows: number; dateMin?: string; dateMax?: string };
    amazonOrderItem:       { rows: number };
    amazonProductSnapshot: { rows: number; dateMin?: string; dateMax?: string };
    amazonAdSnapshot:      { rows: number; dateMin?: string; dateMax?: string };
    amazonSettlement:      { rows: number };
  };
  syncJobs: { done: number; failed: number };
  marketplaceBreakdown: { marketplace: string; orders: number }[];
  generatedAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; cls: string }> = {
    done:    { icon: CheckCircle, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    failed:  { icon: XCircle,    cls: "text-red-400    bg-red-500/10    border-red-500/20"       },
    running: { icon: Loader,     cls: "text-amber-400  bg-amber-500/10  border-amber-500/20"     },
    pending: { icon: Clock,      cls: "text-zinc-400   bg-zinc-800      border-zinc-700"          },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${s.cls}`}>
      <Icon size={10} className={status === "running" ? "animate-spin" : ""} />
      {status}
    </span>
  );
}

function timeStr(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}
function shortDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("it-IT");
}

/* ─── Progress bar ──────────────────────────────────────────────────────────── */
function ProgressBar({ pct, label, color = "bg-blue-500" }: { pct: number; label?: string; color?: string }) {
  return (
    <div className="w-full">
      {label && <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>{label}</span><span>{pct}%</span></div>}
      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* ─── DB Stats Card ─────────────────────────────────────────────────────────── */
function DbStatsPanel({ stats, loading, onRefresh }: { stats: DbStats | null; loading: boolean; onRefresh: () => void }) {
  if (loading) return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
      <div className="h-4 w-48 rounded bg-white/5 animate-pulse mb-4" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
      </div>
    </div>
  );

  if (!stats) return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
      <p className="text-zinc-500 text-sm">Impossibile caricare le statistiche del database.</p>
    </div>
  );

  const tables = [
    { label: "Ordini Amazon", rows: stats.tables.amazonOrder.rows, dateMin: stats.tables.amazonOrder.dateMin, dateMax: stats.tables.amazonOrder.dateMax, icon: Package, color: "text-blue-400" },
    { label: "Order Items", rows: stats.tables.amazonOrderItem.rows, dateMin: null, dateMax: null, icon: FileText, color: "text-purple-400" },
    { label: "Snapshots prodotto", rows: stats.tables.amazonProductSnapshot.rows, dateMin: stats.tables.amazonProductSnapshot.dateMin, dateMax: stats.tables.amazonProductSnapshot.dateMax, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Snapshots PPC", rows: stats.tables.amazonAdSnapshot.rows, dateMin: stats.tables.amazonAdSnapshot.dateMin, dateMax: stats.tables.amazonAdSnapshot.dateMax, icon: BarChart2, color: "text-amber-400" },
    { label: "Settlement", rows: stats.tables.amazonSettlement.rows, dateMin: null, dateMax: null, icon: Shield, color: "text-pink-400" },
  ];

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-blue-400" />
          <h3 className="font-semibold text-white">Stato Database — Verifica dati</h3>
        </div>
        <button onClick={onRefresh} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-bg-hover transition-all">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-5">
        {tables.map(t => (
          <div key={t.label} className="rounded-xl bg-white/[0.02] border border-bg-border p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <t.icon size={14} className={t.color} />
              <p className="text-[10px] sm:text-xs text-zinc-500 leading-tight">{t.label}</p>
            </div>
            <p className={`text-lg sm:text-xl font-bold tabular-nums ${t.rows > 0 ? "text-white" : "text-zinc-600"}`}>
              {fmtNum(t.rows)}
            </p>
            {t.dateMin && (
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1">
                {shortDate(t.dateMin)} → {shortDate(t.dateMax)}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>Sync jobs completati: <strong className="text-emerald-400">{stats.syncJobs.done}</strong></span>
        <span>Falliti: <strong className="text-red-400">{stats.syncJobs.failed}</strong></span>
        {stats.marketplaceBreakdown.map(m => (
          <span key={m.marketplace}>{m.marketplace}: <strong className="text-zinc-300">{fmtNum(m.orders)} ordini</strong></span>
        ))}
        <span className="ml-auto">Aggiornato: {timeStr(stats.generatedAt)}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
export default function AmazonSyncPage() {
  const [jobs, setJobs] = useState<AmazonSyncJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [dbStatsLoading, setDbStatsLoading] = useState(true);
  const [fullSync, setFullSync] = useState<FullSyncProgress | null>(null);
  const [fullSyncDateFrom, setFullSyncDateFrom] = useState("2024-12-31");
  const [triggering, setTriggering] = useState(false);
  const [backfillDays, setBackfillDays] = useState(30);
  const [showJobs, setShowJobs] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Load jobs ─────────────────────────────────────────────────────────── */
  const loadJobs = useCallback(async () => {
    try {
      const data = await api.amazon.syncJobs();
      setJobs(data);
    } catch {}
    finally { setJobsLoading(false); }
  }, []);

  /* ─── Load DB stats ─────────────────────────────────────────────────────── */
  const loadDbStats = useCallback(async () => {
    setDbStatsLoading(true);
    try {
      const r = await fetch(`${BASE}/api/amazon/sync/db-stats`);
      if (r.ok) setDbStats(await r.json());
    } catch {}
    finally { setDbStatsLoading(false); }
  }, []);

  /* ─── Poll full sync progress ───────────────────────────────────────────── */
  const pollProgress = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/amazon/sync/full/progress`);
      if (r.ok) {
        const p: FullSyncProgress = await r.json();
        setFullSync(p);
        if (!p.running && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          loadJobs();
          loadDbStats();
        }
      }
    } catch {}
  }, [loadJobs, loadDbStats]);

  useEffect(() => {
    loadJobs();
    loadDbStats();
    pollProgress(); // check on mount
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadJobs, loadDbStats, pollProgress]);

  /* ─── Trigger full sync ─────────────────────────────────────────────────── */
  const triggerFullSync = async () => {
    if (triggering) return;
    setTriggering(true);
    try {
      const r = await fetch(`${BASE}/api/amazon/sync/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: fullSyncDateFrom }),
      });
      const data = await r.json();
      if (data.status === "started" || data.status === "already_running") {
        // Start polling every 3 seconds
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(pollProgress, 3000);
        pollProgress();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTriggering(false);
    }
  };

  /* ─── Trigger simple backfill ───────────────────────────────────────────── */
  const triggerBackfill = async () => {
    setTriggering(true);
    try {
      await api.amazon.triggerBackfill(backfillDays);
      setTimeout(() => { loadJobs(); loadDbStats(); }, 2000);
    } finally {
      setTriggering(false);
    }
  };

  /* ─── Trigger incremental ───────────────────────────────────────────────── */
  const triggerIncremental = async () => {
    try {
      await api.amazon.triggerIncremental();
      setTimeout(loadJobs, 2000);
    } catch {}
  };

  /* ─── Trigger snapshot ──────────────────────────────────────────────────── */
  const triggerSnapshot = async () => {
    try {
      await api.amazon.triggerSnapshot();
      setTimeout(() => { loadJobs(); loadDbStats(); }, 2000);
    } catch {}
  };

  /* ─── Trigger 180-day historical pipeline ──────────────────────────────── */
  const [historicalRunning, setHistoricalRunning] = useState(false);
  const triggerHistorical = async (days = 180) => {
    setHistoricalRunning(true);
    try {
      await api.amazon.triggerHistorical(days);
      setTimeout(() => { loadJobs(); loadDbStats(); }, 3000);
    } finally {
      setTimeout(() => setHistoricalRunning(false), 5000);
    }
  };

  /* ─── Trigger snapshot-only rebuild ────────────────────────────────────── */
  const [snapshotFullRunning, setSnapshotFullRunning] = useState(false);
  const triggerSnapshotFull = async (days = 180) => {
    setSnapshotFullRunning(true);
    try {
      await api.amazon.triggerSnapshotFull(days);
      setTimeout(() => { loadJobs(); loadDbStats(); }, 3000);
    } finally {
      setTimeout(() => setSnapshotFullRunning(false), 5000);
    }
  };

  const isRunning = fullSync?.running === true;
  const isDone = fullSync && !fullSync.running && fullSync.pct === 100;
  const hasError = fullSync?.error;

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Database size={20} className="text-blue-400" /> Amazon Sync Center
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sincronizzazione completa database Amazon: ordini, PPC, settlement, snapshot prodotti.
        </p>
      </div>

      {/* ─── Phase 3: DB Verification ─────────────────────────────────────── */}
      <DbStatsPanel stats={dbStats} loading={dbStatsLoading} onRefresh={loadDbStats} />

      {/* ─── Full Database Sync (Main action) ──────────────────────────────── */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <Zap size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Sincronizzazione Completa Database</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              3 fasi: Ordini → Settlement + PPC + Keywords → Rebuild Snapshots + Verifica
            </p>
          </div>
        </div>

        {/* Progress display */}
        {fullSync && fullSync.pct > 0 && (
          <div className={`rounded-xl border p-4 mb-4 ${
            hasError ? "border-red-500/30 bg-red-500/5" :
            isDone ? "border-emerald-500/30 bg-emerald-500/5" :
            "border-blue-500/20 bg-blue-500/5"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${hasError ? "text-red-400" : isDone ? "text-emerald-400" : "text-blue-400"}`}>
                {fullSync.phase} › {fullSync.step}
              </span>
              <span className="text-xs text-zinc-400 tabular-nums">{fullSync.pct}%</span>
            </div>
            <ProgressBar
              pct={fullSync.pct}
              color={hasError ? "bg-red-500" : isDone ? "bg-emerald-500" : "bg-blue-500"}
            />
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{fullSync.detail}</p>
          </div>
        )}

        <div className="flex items-end gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Data di inizio</label>
            <input
              type="date"
              value={fullSyncDateFrom}
              onChange={e => setFullSyncDateFrom(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 rounded-xl border border-bg-border bg-bg-card text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>
          <button
            onClick={triggerFullSync}
            disabled={isRunning || triggering}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {isRunning ? "In esecuzione..." : isDone ? "✅ Completato — Riavvia" : "Avvia sync completo"}
          </button>
          {isRunning && (
            <p className="text-xs text-zinc-400 animate-pulse">Aggiornamento automatico ogni 3s...</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-zinc-500">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-bg-border">
            <Package size={13} className="text-blue-400 mt-0.5 shrink-0" />
            <div><strong className="text-zinc-300">Fase 1 — Ordini</strong><br />
              Report SP-API a chunk da 30 giorni, tutti i marketplace EU, TSV parse + upsert DB
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-bg-border">
            <BarChart2 size={13} className="text-amber-400 mt-0.5 shrink-0" />
            <div><strong className="text-zinc-300">Fase 2 — P&L + PPC</strong><br />
              Settlement (rendiconti Amazon), Advertising campagne + keyword metrics
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-bg-border">
            <Shield size={13} className="text-emerald-400 mt-0.5 shrink-0" />
            <div><strong className="text-zinc-300">Fase 3 — Verifica</strong><br />
              Rebuild snapshot giornalieri, conteggio record, validazione date range
            </div>
          </div>
        </div>
      </div>

      {/* ─── 180-day Historical Pipeline ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <TrendingUp size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Storico 180 giorni (Fuso orario Italia)</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Scarica gli ordini degli ultimi 180gg via SP-API e ricalcola tutti gli snapshot con ora legale italiana corretta.
              Richiede ~30-60 min. Da eseguire una volta sola per costruire lo storico.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Full pipeline: orders + snapshots */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-300 mb-1">🔄 Pipeline Completo</p>
            <p className="text-xs text-zinc-500 mb-3">Scarica ordini via SP-API + ricalcola snapshot 180gg</p>
            <button
              onClick={() => triggerHistorical(180)}
              disabled={historicalRunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-all disabled:opacity-50"
            >
              {historicalRunning
                ? <><RefreshCw size={13} className="animate-spin" /> Avviato (background)…</>
                : <><Play size={13} /> Avvia Pipeline 180gg</>}
            </button>
          </div>
          {/* Snapshot-only rebuild (faster, uses existing orders) */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm font-semibold text-blue-300 mb-1">📊 Solo Snapshot</p>
            <p className="text-xs text-zinc-500 mb-3">Ricalcola snapshot da ordini già in DB (più veloce, ~5 min)</p>
            <button
              onClick={() => triggerSnapshotFull(180)}
              disabled={snapshotFullRunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-sm font-medium text-blue-300 hover:bg-blue-500/30 transition-all disabled:opacity-50"
            >
              {snapshotFullRunning
                ? <><RefreshCw size={13} className="animate-spin" /> Avviato (background)…</>
                : <><BarChart2 size={13} /> Rebuild Snapshot 180gg</>}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-700 mt-3">
          ℹ️ Il rebuild snapshot usa il timezone Europe/Rome per attribuire correttamente gli ordini notturni (0:00-2:00 ora italiana) al giorno corretto.
        </p>
      </div>

      {/* ─── Individual triggers ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
        <h3 className="font-semibold text-white mb-4">Sync rapidi</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Incremental */}
          <div className="rounded-xl border border-bg-border p-4">
            <p className="text-sm font-medium text-white mb-1">Incrementale</p>
            <p className="text-xs text-zinc-500 mb-3">Ultimi 2 giorni ordini</p>
            <button
              onClick={triggerIncremental}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-bg-hover border border-bg-border text-sm text-zinc-300 hover:text-white transition-all"
            >
              <RefreshCw size={13} /> Avvia
            </button>
          </div>

          {/* Backfill with days */}
          <div className="rounded-xl border border-bg-border p-4">
            <p className="text-sm font-medium text-white mb-1">Backfill ordini</p>
            <p className="text-xs text-zinc-500 mb-3">Solo ordini, N giorni</p>
            <div className="flex gap-2">
              <input
                type="number" min={1} max={500}
                value={backfillDays}
                onChange={e => setBackfillDays(Number(e.target.value))}
                className="w-20 px-2 py-1.5 rounded-lg border border-bg-border bg-bg-base text-white text-sm"
              />
              <button
                onClick={triggerBackfill}
                disabled={triggering}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-bg-hover border border-bg-border text-sm text-zinc-300 hover:text-white transition-all disabled:opacity-50"
              >
                <Play size={13} /> Avvia
              </button>
            </div>
          </div>

          {/* Snapshot */}
          <div className="rounded-xl border border-bg-border p-4">
            <p className="text-sm font-medium text-white mb-1">Rebuild Snapshots</p>
            <p className="text-xs text-zinc-500 mb-3">Ricalcola aggregati prodotto</p>
            <button
              onClick={triggerSnapshot}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-bg-hover border border-bg-border text-sm text-zinc-300 hover:text-white transition-all"
            >
              <RefreshCw size={13} /> Avvia
            </button>
          </div>
        </div>
      </div>

      {/* ─── Sync Jobs audit log ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
        <button
          onClick={() => setShowJobs(v => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Audit Log Sync Jobs</h3>
            <span className="text-xs text-zinc-500">({jobs.length} jobs)</span>
          </div>
          {showJobs ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
        </button>

        {showJobs && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={loadJobs} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-all">
                <RefreshCw size={12} /> Aggiorna
              </button>
            </div>
            {jobsLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-bg-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {["Tipo", "Marketplace", "Periodo", "Status", "Record", "Durata", "Avviato"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-zinc-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {jobs.slice(0, 100).map(j => {
                      const dur = j.completedAt
                        ? Math.round((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 1000)
                        : null;
                      return (
                        <tr key={j.id} className="table-row-hover">
                          <td className="px-3 py-2 text-zinc-300 font-mono">{j.jobType}</td>
                          <td className="px-3 py-2 text-zinc-400">{j.marketplace}</td>
                          <td className="px-3 py-2 text-zinc-400">
                            {j.dateFrom ? shortDate(j.dateFrom) : "—"} → {j.dateTo ? shortDate(j.dateTo) : "—"}
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                          <td className="px-3 py-2">
                            <span className="text-emerald-400">+{fmtNum(j.recordsImported)}</span>
                            {" "}<span className="text-blue-400">~{fmtNum(j.recordsUpdated)}</span>
                            {j.recordsRejected > 0 && <span className="text-red-400"> ✗{fmtNum(j.recordsRejected)}</span>}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{dur != null ? `${dur}s` : "—"}</td>
                          <td className="px-3 py-2 text-zinc-500">{timeStr(j.startedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
