"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, Check, FileText, Image as ImageIcon, LayoutDashboard, Loader2, RefreshCw, Rocket, Save } from "lucide-react";
import { api, type MarketingWorkspaceResponse, type TrafficMetric, type WorkbookDocument } from "@/lib/api";
import OverviewTab from "./OverviewTab";
import CommunicationTab, { type CommunicationData } from "./CommunicationTab";
import LaunchWorkbookTab from "./LaunchWorkbookTab";
import PedTab, { type PedData } from "./PedTab";
import ImagesTab, { type AssetsData } from "./ImagesTab";
import { createDefaultWorkbook } from "./workbook-model";

type Tab = "overview" | "communication" | "launch" | "ped" | "images";
interface State { overview: Record<string, unknown>; communication: CommunicationData; workbook: WorkbookDocument; ped: PedData; assets: AssetsData; }
const TABS: Array<{ id: Tab; label: string; icon: typeof Rocket }> = [
  { id: "overview", label: "Panoramica", icon: LayoutDashboard }, { id: "communication", label: "Comunicazione", icon: FileText },
  { id: "launch", label: "Lancio", icon: Rocket }, { id: "ped", label: "PED", icon: CalendarDays }, { id: "images", label: "Immagini", icon: ImageIcon },
];
const EMPTY: State = {
  overview: {}, workbook: createDefaultWorkbook(), ped: { items: [] }, assets: { folders: ["Listing", "A+ Content", "Social", "Packaging"], items: [] },
  communication: { title: "", bullets: ["", "", "", "", ""], description: "", keywords: "" },
};

function hydrate(response: MarketingWorkspaceResponse): State {
  const workspace = response.workspace;
  return {
    overview: (workspace?.overview as State["overview"]) ?? {},
    communication: { ...EMPTY.communication, ...((workspace?.communication as Partial<CommunicationData>) ?? {}) },
    workbook: workspace?.workbook?.rows ? workspace.workbook : createDefaultWorkbook(),
    ped: { ...EMPTY.ped, ...((workspace?.ped as Partial<PedData>) ?? {}) },
    assets: { ...EMPTY.assets, ...((workspace?.assets as Partial<AssetsData>) ?? {}) },
  };
}

export default function ProductWorkspace({ productId }: { productId: string }) {
  const [tab, setTab] = useState<Tab>("overview"); const [marketplace, setMarketplace] = useState("IT");
  const [response, setResponse] = useState<MarketingWorkspaceResponse | null>(null); const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null); const dirty = useRef(false);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const data = await api.productWorkspace.get(productId, marketplace); setResponse(data); setState(hydrate(data)); dirty.current = false; } catch (cause) { setError(cause instanceof Error ? cause.message : "Caricamento fallito"); } finally { setLoading(false); } }, [productId, marketplace]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!dirty.current || loading) return; setSaveState("saving"); const timer = window.setTimeout(async () => { try { await api.productWorkspace.save(productId, marketplace, { overview: state.overview, communication: state.communication as unknown as Record<string, unknown>, workbook: state.workbook, ped: state.ped as unknown as Record<string, unknown>, assets: state.assets as unknown as Record<string, unknown> }); dirty.current = false; setSaveState("saved"); } catch { setSaveState("error"); } }, 700); return () => window.clearTimeout(timer); }, [state, loading, productId, marketplace]);
  const change = <K extends keyof State>(key: K, value: State[K]) => { dirty.current = true; setState((current) => ({ ...current, [key]: value })); };
  const traffic = useMemo(() => (response?.workspace?.trafficData ?? []) as TrafficMetric[], [response]);
  async function sync() { setSyncing(true); setError(null); try { const result = await api.productWorkspace.sync(productId, marketplace); if (result.warning) setError(`Importazione parziale: ${result.warning}`); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sincronizzazione fallita"); } finally { setSyncing(false); } }
  async function importExcel(file: File) { const data = await file.arrayBuffer(); const bytes = new Uint8Array(data); let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); await api.productWorkspace.importExcel(productId, marketplace, btoa(binary)); await load(); setTab("launch"); }
  if (loading && !response) return <div className="flex min-h-[440px] items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 animate-spin"/>Carico l’area prodotto…</div>;
  if (!response) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center"><AlertTriangle className="mx-auto text-red-400"/><p className="mt-3 text-sm text-zinc-300">{error ?? "Prodotto non disponibile"}</p><button onClick={load} className="mt-4 text-xs text-accent-amber">Riprova</button></div>;
  const identifiers = response.product.identifiers.filter((item) => item.asin);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><Link href="/amazon/marketing" className="mt-1 rounded-lg border border-bg-border p-2 text-zinc-500 hover:text-white"><ArrowLeft size={15}/></Link><div><div className="text-[10px] uppercase tracking-[.15em] text-accent-amber">Amazon Marketing · Area prodotto</div><h1 className="mt-1 text-xl font-bold text-zinc-100">{response.product.name}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500"><span>{response.product.brand ?? "Brand non assegnato"}</span><span>·</span><span className="font-mono">ASIN {response.identifier?.asin ?? "—"}</span><span>·</span><span>SKU {response.identifier?.sku ?? "—"}</span></div></div></div>
      <div className="flex items-center gap-2"><select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs text-zinc-300">{[...new Set(identifiers.map((item) => item.marketplace))].map((item) => <option key={item}>{item}</option>)}</select><button onClick={sync} disabled={syncing || !response.identifier?.asin} className="inline-flex items-center gap-2 rounded-lg bg-accent-amber px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">{syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Importa dati</button></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bg-border bg-bg-card px-3 py-2"><nav className="flex items-center gap-1 overflow-x-auto">{TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs ${tab === item.id ? "bg-accent-amber/10 text-accent-amber" : "text-zinc-500 hover:bg-bg-hover hover:text-zinc-200"}`}><item.icon size={14}/>{item.label}</button>)}</nav><div className={`inline-flex items-center gap-1.5 px-2 text-[10px] ${saveState === "error" ? "text-red-400" : "text-zinc-500"}`}>{saveState === "saving" ? <Loader2 size={11} className="animate-spin"/> : saveState === "saved" ? <Check size={11} className="text-emerald-400"/> : <Save size={11}/>} {saveState === "saving" ? "Salvataggio…" : saveState === "error" ? "Errore salvataggio" : "Salvataggio automatico"}</div></div>
    {error && <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>{error}</div>}
    {tab === "overview" && <OverviewTab metrics={response.metrics} traffic={traffic} onOpen={(next) => setTab(next as Tab)}/>} 
    {tab === "communication" && <CommunicationTab value={state.communication} onChange={(value) => change("communication", value)}/>} 
    {tab === "launch" && <LaunchWorkbookTab workbook={state.workbook} metrics={response.metrics} traffic={traffic} asin={response.identifier?.asin ?? null} onChange={(value) => change("workbook", value)} onImport={importExcel}/>} 
    {tab === "ped" && <PedTab value={state.ped} onChange={(value) => change("ped", value)}/>} 
    {tab === "images" && <ImagesTab value={state.assets} onChange={(value) => change("assets", value)}/>} 
  </div>;
}
