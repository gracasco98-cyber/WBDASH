"use client";
import { useState, useEffect, useCallback } from "react";
import { api, AmazonSyncJob } from "@/lib/api";
import { RefreshCw, Play, Download, CheckCircle, XCircle, Clock, Loader } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; cls: string }> = {
    done:    { icon: CheckCircle, cls: "text-accent-primary bg-accent-primary/10 border-accent-primary/20" },
    failed:  { icon: XCircle,     cls: "text-accent-red    bg-accent-red/10    border-accent-red/20"    },
    running: { icon: Loader,      cls: "text-accent-amber  bg-accent-amber/10  border-accent-amber/20"  },
    pending: { icon: Clock,       cls: "text-zinc-400      bg-zinc-800         border-zinc-700"         },
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

function fmt(n?: number | null) { return (n ?? 0).toLocaleString("it-IT"); }

function timeStr(s: string) {
  return new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const MP_OPTIONS = [
  { value: "",      label: "Tutti (EU)"      },
  { value: "IT",    label: "🇮🇹 Amazon.it"   },
  { value: "DE",    label: "🇩🇪 Amazon.de"   },
  { value: "FR",    label: "🇫🇷 Amazon.fr"   },
  { value: "ES",    label: "🇪🇸 Amazon.es"   },
  { value: "PL",    label: "🇵🇱 Amazon.pl"   },
  { value: "UK",    label: "🇬🇧 Amazon.co.uk" },
  { value: "ALL_NA", label: "🌎 Tutti (NA)"  },
  { value: "US",    label: "🇺🇸 Amazon.com"  },
  { value: "CA",    label: "🇨🇦 Amazon.ca"   },
  { value: "MX",    label: "🇲🇽 Amazon.com.mx"},
];

export default function AmazonSyncCenter() {
  const [jobs, setJobs] = useState<AmazonSyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfillDays, setBackfillDays] = useState(30);
  const [backfillMp, setBackfillMp] = useState("");
  const [triggering, setTriggering] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api.amazon.syncJobs());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Auto-refresh every 5s while a job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "pending");
    if (!hasRunning) return;
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, [jobs, loadJobs]);

  async function handleBackfill() {
    setTriggering(true);
    try {
      await api.amazon.triggerBackfill(backfillDays, backfillMp || undefined);
      setTimeout(loadJobs, 1000);
    } finally {
      setTriggering(false);
    }
  }

  async function handleIncremental() {
    setTriggering(true);
    try {
      await api.amazon.triggerIncremental();
      setTimeout(loadJobs, 1000);
    } finally {
      setTriggering(false);
    }
  }

  async function handleSnapshot() {
    setTriggering(true);
    try {
      await api.amazon.triggerSnapshot();
      setTimeout(loadJobs, 1000);
    } finally {
      setTriggering(false);
    }
  }

  async function handleSettlement() {
    setTriggering(true);
    try {
      await api.amazon.triggerSettlement();
      setTimeout(loadJobs, 1000);
    } finally {
      setTriggering(false);
    }
  }

  async function handleAdsSync(days?: number) {
    setTriggering(true);
    try {
      await api.amazon.triggerAdsSync(days);
      setTimeout(loadJobs, 1000);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Backfill */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Backfill Ordini</h3>
            <p className="text-xs text-zinc-500 mt-1">Importa ordini storici da Amazon SP-API</p>
          </div>
          <div className="flex gap-2">
            <select
              value={backfillDays}
              onChange={(e) => setBackfillDays(Number(e.target.value))}
              className="flex-1 bg-bg-base border border-bg-border text-zinc-300 text-xs rounded-lg px-2 py-2 focus:outline-none"
            >
              <option value={7}>7 giorni</option>
              <option value={14}>14 giorni</option>
              <option value={30}>30 giorni</option>
              <option value={60}>60 giorni</option>
              <option value={90}>90 giorni</option>
            </select>
            <select
              value={backfillMp}
              onChange={(e) => setBackfillMp(e.target.value)}
              className="flex-1 bg-bg-base border border-bg-border text-zinc-300 text-xs rounded-lg px-2 py-2 focus:outline-none"
            >
              {MP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button
            onClick={handleBackfill}
            disabled={triggering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium rounded-lg hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            Avvia Backfill
          </button>
        </div>

        {/* Incremental */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Sync Incrementale</h3>
            <p className="text-xs text-zinc-500 mt-1">Aggiorna ordini ultimi 2 giorni (automatico ogni ora)</p>
          </div>
          <button
            onClick={handleIncremental}
            disabled={triggering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-medium rounded-lg hover:bg-accent-blue/20 transition-colors disabled:opacity-50"
          >
            <Play size={13} />
            Esegui ora
          </button>
        </div>

        {/* Snapshot */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Snapshot Prodotti</h3>
            <p className="text-xs text-zinc-500 mt-1">Ricalcola aggregati giornalieri prodotti Amazon</p>
          </div>
          <button
            onClick={handleSnapshot}
            disabled={triggering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-purple/10 border border-accent-purple/20 text-accent-purple text-xs font-medium rounded-lg hover:bg-accent-purple/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} />
            Ricalcola snapshot
          </button>
        </div>

        {/* Settlement */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Rendiconto (Settlement)</h3>
            <p className="text-xs text-zinc-500 mt-1">Importa commissioni reali da report di rendiconto Amazon (ogni 2 settimane)</p>
          </div>
          <button
            onClick={handleSettlement}
            disabled={triggering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-amber/10 border border-accent-amber/20 text-accent-amber text-xs font-medium rounded-lg hover:bg-accent-amber/20 transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            Sincronizza rendiconto
          </button>
        </div>

        {/* Ads / PPC */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">📣 Advertising (PPC)</h3>
            <p className="text-xs text-zinc-500 mt-1">Importa metriche campagne SP da Amazon Ads API v3. I report richiedono ~10 min.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleAdsSync()}
              disabled={triggering}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium rounded-lg hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} />
              Sync ieri
            </button>
            <button
              onClick={() => handleAdsSync(30)}
              disabled={triggering}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bg-base border border-bg-border text-zinc-400 text-xs font-medium rounded-lg hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
            >
              <Download size={13} />
              Backfill 30 giorni
            </button>
          </div>
        </div>
      </div>

      {/* Jobs audit log */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border">
          <h3 className="text-sm font-semibold text-white">Audit Log Sincronizzazioni</h3>
          <button
            onClick={loadJobs}
            className="p-1.5 rounded hover:bg-bg-hover text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border">
                {["Tipo", "Marketplace", "Periodo", "Status", "Importati", "Aggiornati", "Rifiutati", "Durata", "Avviato"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-bg-border rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-600">
                    Nessun job ancora — avvia un backfill
                  </td>
                </tr>
              ) : (
                jobs.map((j) => {
                  const duration = j.completedAt
                    ? Math.round((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={j.id} className="table-row-hover">
                      <td className="px-4 py-3 text-zinc-300 font-medium">{j.jobType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-zinc-400">{j.marketplace}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {j.dateFrom ? `${new Date(j.dateFrom).toLocaleDateString("it-IT")} → ${j.dateTo ? new Date(j.dateTo).toLocaleDateString("it-IT") : "?"}` : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                      <td className="px-4 py-3 text-accent-primary tabular-nums">{fmt(j.recordsImported)}</td>
                      <td className="px-4 py-3 text-zinc-400 tabular-nums">{fmt(j.recordsUpdated)}</td>
                      <td className="px-4 py-3 text-accent-red tabular-nums">{fmt(j.recordsRejected)}</td>
                      <td className="px-4 py-3 text-zinc-500">{duration != null ? `${duration}s` : "—"}</td>
                      <td className="px-4 py-3 text-zinc-600">{timeStr(j.startedAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {jobs.some((j) => j.errorMessage) && (
          <div className="px-5 py-3 border-t border-bg-border">
            {jobs.filter((j) => j.errorMessage).slice(0, 3).map((j) => (
              <div key={j.id} className="text-xs text-accent-red truncate">
                ⚠ {j.jobType}: {j.errorMessage}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
