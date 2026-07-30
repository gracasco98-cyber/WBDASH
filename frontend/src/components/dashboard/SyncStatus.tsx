"use client";
import { useEffect, useState } from "react";
import { api, SyncState } from "@/lib/api";
import { RefreshCw, CheckCircle, AlertCircle, Loader } from "lucide-react";

export default function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    const load = () => api.syncStatus().then(setState).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  if (!state) return null;

  const icon = state.status === "running"
    ? <Loader size={12} className="animate-spin text-accent-amber" />
    : state.status === "error"
    ? <AlertCircle size={12} className="text-accent-red" />
    : <CheckCircle size={12} className="text-accent-primary" />;

  const label = state.status === "running"
    ? "Sincronizzazione..."
    : state.status === "error"
    ? "Errore sync"
    : "Sincronizzato";

  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500 border border-bg-border rounded-lg px-3 py-1.5">
      {icon}
      <span>{label}</span>
    </div>
  );
}
