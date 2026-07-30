"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { MARKETPLACE_RULES } from "@/lib/marketplace-rules-client";
import { getMeta } from "@/lib/marketplaces";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw, Search, AlertTriangle, CheckCircle } from "lucide-react";

export default function AdminPage() {
  const [errors, setErrors] = useState<any[]>([]);
  const [syncState, setSyncState] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // Detection tester
  const [testTags, setTestTags] = useState("REDCARE_IT, altro tag");
  const [testSource, setTestSource] = useState("");
  const [testChannel, setTestChannel] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    api.errors().then(setErrors).catch(() => {});
    api.syncStatus().then(setSyncState).catch(() => {});
  }, []);

  const triggerSync = async (full: boolean) => {
    setSyncing(true);
    await api.triggerSync(full);
    setTimeout(async () => {
      const state = await api.syncStatus();
      setSyncState(state);
      setSyncing(false);
    }, 2000);
  };

  const runTest = async () => {
    const tags = testTags.split(",").map((t) => t.trim()).filter(Boolean);
    const result = await api.testDetection(tags, testSource, testChannel);
    setTestResult(result);
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-border px-6 py-4 flex items-center gap-4 sticky top-0 bg-bg-base/95 backdrop-blur-sm z-40">
        <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <span className="font-semibold text-white">Pannello Admin</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6 animate-in">

        {/* ── Sync Control ── */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 pb-3 border-b border-bg-border">
            Controllo Sincronizzazione
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-bg-base rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">Stato</div>
              <div className="flex items-center gap-2">
                {syncState?.status === "running"
                  ? <div className="live-dot w-2 h-2 rounded-full bg-accent-amber" />
                  : syncState?.status === "error"
                  ? <AlertTriangle size={12} className="text-accent-red" />
                  : <CheckCircle size={12} className="text-accent-primary" />}
                <span className="text-sm text-white capitalize">{syncState?.status ?? "—"}</span>
              </div>
            </div>
            <div className="bg-bg-base rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">Ultimo sync</div>
              <div className="text-sm text-white">
                {syncState?.lastSyncAt
                  ? new Date(syncState.lastSyncAt).toLocaleString("it-IT")
                  : "Mai"}
              </div>
            </div>
            <div className="bg-bg-base rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">Ordini sincronizzati</div>
              <div className="text-sm text-white tabular-nums">
                {syncState?.totalSynced?.toLocaleString("it-IT") ?? "0"}
              </div>
            </div>
          </div>
          {syncState?.error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-accent-red/10 border border-accent-red/20 text-xs text-accent-red font-mono">
              {syncState.error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => triggerSync(false)}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary text-xs font-medium hover:bg-accent-primary/15 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={13} className={syncing ? "animate-spin" : ""} />
              Sync incrementale
            </button>
            <button
              onClick={() => triggerSync(true)}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 text-accent-blue text-xs font-medium hover:bg-accent-blue/15 transition-colors disabled:opacity-50"
            >
              <Play size={13} />
              Sync completo (90gg)
            </button>
          </div>
        </div>

        {/* ── Detection Tester ── */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 pb-3 border-b border-bg-border">
            Testa Rilevamento Marketplace
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Tag (separati da virgola)</label>
              <input
                value={testTags}
                onChange={(e) => setTestTags(e.target.value)}
                placeholder="REDCARE_IT, altro"
                className="w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-base text-zinc-200 text-xs focus:outline-none focus:border-accent-primary/40 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">sourceName</label>
              <input
                value={testSource}
                onChange={(e) => setTestSource(e.target.value)}
                placeholder="es. redcare_it"
                className="w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-base text-zinc-200 text-xs focus:outline-none focus:border-accent-primary/40 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">channelDisplayName</label>
              <input
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value)}
                placeholder="es. Redcare IT"
                className="w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-base text-zinc-200 text-xs focus:outline-none focus:border-accent-primary/40 font-mono"
              />
            </div>
          </div>
          <button
            onClick={runTest}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-accent-amber/30 bg-accent-amber/10 text-accent-amber text-xs font-medium hover:bg-accent-amber/15 transition-colors mb-4"
          >
            <Search size={13} />
            Testa rilevamento
          </button>

          {testResult && (
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: getMeta(testResult.marketplace).color + "40",
                background: getMeta(testResult.marketplace).bg,
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg font-bold" style={{ color: getMeta(testResult.marketplace).color }}>
                  {testResult.displayName}
                </span>
                <span className="text-xs text-zinc-500">({testResult.marketplace})</span>
              </div>
              <div className="text-xs font-mono text-zinc-400 bg-bg-card/50 rounded px-3 py-2">
                {testResult.reason}
              </div>
            </div>
          )}
        </div>

        {/* ── Marketplace Rules ── */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-bg-border">
            <h2 className="text-sm font-semibold text-white">Regole Marketplace Attive</h2>
            <span className="text-xs text-zinc-500">
              Modifica: <code className="font-mono text-accent-primary text-xs">backend/src/config/marketplace-rules.ts</code>
            </span>
          </div>
          <div className="space-y-2">
            {MARKETPLACE_RULES.map((rule) => {
              const meta = getMeta(rule.name);
              return (
                <div key={rule.name} className="flex items-start gap-4 py-3 border-b border-bg-border/40 last:border-0">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <span className="text-sm text-white">{rule.displayName}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {rule.tagPatterns.map((p) => (
                        <span key={p} className="px-2 py-0.5 rounded text-xs font-mono bg-bg-base border border-bg-border text-zinc-400">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 tabular-nums w-16 text-right">
                    p:{rule.priority}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent Errors ── */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 pb-3 border-b border-bg-border">
            Ultimi Errori ({errors.length})
          </h2>
          {errors.length === 0 ? (
            <div className="flex items-center gap-2 text-accent-primary text-sm">
              <CheckCircle size={14} />
              Nessun errore registrato
            </div>
          ) : (
            <div className="space-y-2">
              {errors.slice(0, 10).map((e) => (
                <div key={e.id} className="rounded-lg bg-bg-base border border-accent-red/15 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-accent-red">[{e.source}]</span>
                    <span className="text-xs text-zinc-500">
                      {new Date(e.createdAt).toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">{e.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
