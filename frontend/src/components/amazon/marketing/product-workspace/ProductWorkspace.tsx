"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarDays, Check, ChevronDown, FileText, Image as ImageIcon,
  LayoutDashboard, Loader2, Package, RefreshCw, Rocket, Save, Search, SlidersHorizontal,
} from "lucide-react";
import {
  api, type LaunchCatalogProduct, type MarketingWorkspaceResponse, type TrafficMetric,
  type WorkbookDocument,
} from "@/lib/api";
import OverviewTab from "./OverviewTab";
import CommunicationTab, { type CommunicationData } from "./CommunicationTab";
import LaunchWorkbookTab from "./LaunchWorkbookTab";
import PedTab, { type PedData } from "./PedTab";
import ImagesTab, { type AssetsData } from "./ImagesTab";
import { createDefaultWorkbook } from "./workbook-model";

type Tab = "overview" | "communication" | "launch" | "ped" | "images";
interface State { overview: Record<string, unknown>; communication: CommunicationData; workbook: WorkbookDocument; ped: PedData; assets: AssetsData; }
const TABS: Array<{ id: Tab; label: string; icon: typeof Rocket; description: string }> = [
  { id: "overview", label: "Panoramica", icon: LayoutDashboard, description: "Identità, stato e performance del prodotto" },
  { id: "communication", label: "Comunicazione", icon: FileText, description: "Titolo, bullet, descrizione e keyword Amazon" },
  { id: "launch", label: "Lancio", icon: Rocket, description: "Workbook operativo e dati automatici per ASIN" },
  { id: "ped", label: "PED", icon: CalendarDays, description: "Piano editoriale, approvazioni e pubblicazioni" },
  { id: "images", label: "Immagini", icon: ImageIcon, description: "Archivio in stile Drive per listing e campagne" },
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
  const [tab, setTab] = useState<Tab>("overview");
  const [marketplace, setMarketplace] = useState("IT");
  const [response, setResponse] = useState<MarketingWorkspaceResponse | null>(null);
  const [state, setState] = useState<State>(EMPTY);
  const [catalog, setCatalog] = useState<LaunchCatalogProduct[]>([]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.productWorkspace.get(productId, marketplace);
      setResponse(data); setState(hydrate(data)); dirty.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Caricamento fallito");
    } finally { setLoading(false); }
  }, [productId, marketplace]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.launches.catalog().then(async ({ products }) => {
      setCatalog(products);
      const asins = [...new Set(products.flatMap((product) => product.identifiers.map((item) => item.asin).filter((asin): asin is string => !!asin)))];
      if (asins.length) setImages(await api.amazon.catalogImages(asins.slice(0, 60)));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!dirty.current || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await api.productWorkspace.save(productId, marketplace, {
          overview: state.overview, communication: state.communication as unknown as Record<string, unknown>, workbook: state.workbook,
          ped: state.ped as unknown as Record<string, unknown>, assets: state.assets as unknown as Record<string, unknown>,
        });
        dirty.current = false; setSaveState("saved");
      } catch { setSaveState("error"); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, loading, productId, marketplace]);

  const change = <K extends keyof State>(key: K, value: State[K]) => { dirty.current = true; setState((current) => ({ ...current, [key]: value })); };
  const traffic = useMemo(() => (response?.workspace?.trafficData ?? []) as TrafficMetric[], [response]);
  const filteredCatalog = useMemo(() => catalog.filter((product) => {
    const text = `${product.name} ${product.brand ?? ""} ${product.identifiers.map((item) => `${item.asin ?? ""} ${item.sku ?? ""}`).join(" ")}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }), [catalog, query]);

  async function sync() {
    setSyncing(true); setError(null);
    try {
      const result = await api.productWorkspace.sync(productId, marketplace);
      if (result.warning) setError(`Importazione parziale: ${result.warning}`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sincronizzazione fallita"); }
    finally { setSyncing(false); }
  }
  async function importExcel(file: File) {
    const data = await file.arrayBuffer(); const bytes = new Uint8Array(data); let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    await api.productWorkspace.importExcel(productId, marketplace, btoa(binary)); await load(); setTab("launch");
  }

  if (loading && !response) return <div className="flex min-h-screen items-center justify-center bg-[#f3f6fb] text-sm text-slate-500"><Loader2 className="mr-2 animate-spin"/>Carico l’area prodotto…</div>;
  if (!response) return <div className="m-6 rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm"><AlertTriangle className="mx-auto text-red-500"/><p className="mt-3 text-sm text-slate-600">{error ?? "Prodotto non disponibile"}</p><button onClick={load} className="mt-4 text-xs font-semibold text-amber-700">Riprova</button></div>;

  const identifiers = response.product.identifiers.filter((item) => item.asin);
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];
  const currentImage = response.identifier?.asin ? images[response.identifier.asin] : null;

  return <div className="flex min-h-screen bg-[#f3f6fb] text-slate-700">
    <aside className="hidden w-[306px] shrink-0 border-r border-slate-200 bg-white xl:flex xl:flex-col">
      <div className="border-b border-slate-200 p-4">
        <div className="relative"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ovunque nei prodotti…" className="h-10 w-full rounded-full border border-slate-300 bg-slate-50 pl-10 pr-4 text-xs text-slate-700 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-100"/></div>
        <div className="mt-3 flex items-center gap-2"><span className="text-xs text-slate-500">Etichetta</span><button className="flex h-9 flex-1 items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">Tutte <ChevronDown size={14}/></button><button className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Filtri"><SlidersHorizontal size={17}/></button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {filteredCatalog.map((product) => {
          const primary = product.identifiers.find((item) => item.marketplace === marketplace && item.asin) ?? product.identifiers.find((item) => item.asin);
          const selected = product.id === productId;
          return <Link key={product.id} href={`/amazon/marketing/products/${product.id}`} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${selected ? "bg-[#f0ede4] shadow-[inset_3px_0_0_#9a7412]" : "hover:bg-slate-50"}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${primary?.asin ? "bg-red-500" : "bg-slate-300"}`}/>
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white">
              {primary?.asin && images[primary.asin] ? <img src={images[primary.asin] ?? ""} alt="" className="h-full w-full object-contain p-1"/> : <Package size={19} className="text-slate-400"/>}
            </span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold tracking-wide text-slate-700">{product.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{product.brand ?? "Brand non assegnato"}{primary?.marketplace ? ` · ${primary.marketplace}` : ""}</span></span>
            <span className="text-[10px] tabular-nums text-slate-500">{selected ? "100%" : "0%"}</span>
          </Link>;
        })}
        {!filteredCatalog.length && <div className="px-4 py-16 text-center text-xs text-slate-400">Nessun prodotto trovato</div>}
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex min-h-[84px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-[22px] font-bold tracking-tight text-slate-900">{response.product.name}</h1><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold tracking-wide text-slate-600">{response.product.brand ?? "BRAND NON ASSEGNATO"}</span></div><div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-500"/><span>Stato da confermare</span><span className="text-slate-300">·</span><span className="font-mono text-[11px]">ASIN {response.identifier?.asin ?? "non collegato"}</span></div></div>
          <div className="flex flex-wrap items-center gap-2"><label className="hidden text-xs text-slate-500 sm:block">Variante</label><select value={marketplace} onChange={(event) => setMarketplace(event.target.value)} className="h-10 min-w-36 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none">{[...new Set(identifiers.map((item) => item.marketplace))].map((item) => <option key={item}>{item}</option>)}</select><button onClick={sync} disabled={syncing || !response.identifier?.asin} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-40">{syncing ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>} Aggiorna dati</button></div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 lg:px-6">
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">{TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex h-14 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-xs font-semibold transition ${tab === item.id ? "border-[#94710e] bg-amber-50/70 text-[#7d5f09]" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><item.icon size={16}/>{item.label}</button>)}</nav>
          <div className={`hidden items-center gap-1.5 px-2 text-[10px] sm:inline-flex ${saveState === "error" ? "text-red-600" : "text-slate-500"}`}>{saveState === "saving" ? <Loader2 size={12} className="animate-spin"/> : saveState === "saved" ? <Check size={12} className="text-emerald-600"/> : <Save size={12}/>} {saveState === "saving" ? "Salvataggio…" : saveState === "error" ? "Errore salvataggio" : "Salvataggio automatico"}</div>
        </div>
        <div className="flex h-12 items-center gap-2 border-t border-slate-200 px-6"><span className="rounded-full bg-[#98740f] px-4 py-1.5 text-xs font-bold text-white">{marketplace}</span>{["ES", "FR", "DE", "NL", "USA"].filter((country) => country !== marketplace).map((country) => <span key={country} className="px-3 text-xs font-semibold text-slate-500">{country}</span>)}<button className="ml-1 inline-flex items-center gap-1 px-2 text-xs text-slate-500"><span className="text-lg font-light">+</span> Paese</button></div>
      </header>

      <div className="border-b border-slate-200 bg-[#f6f8fb] px-5 py-4 lg:px-8"><div className="flex items-center justify-between gap-4"><div><h2 className="text-base font-bold text-slate-900">{activeTab.label}</h2><p className="mt-0.5 text-xs text-slate-500">{activeTab.description} · {marketplace}</p></div>{tab === "overview" && <span className="hidden rounded-full bg-[#94710e] px-4 py-2 text-xs font-bold text-white md:inline">Workspace prodotto</span>}</div></div>
      {error && <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 lg:mx-8"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{error}</div>}
      <main className="p-4 lg:p-6 xl:p-8">
        {tab === "overview" && (
          <OverviewTab product={response.product} identifier={response.identifier} imageUrl={currentImage} metrics={response.metrics} traffic={traffic} workspace={response.workspace} onOpen={(next) => setTab(next as Tab)}/>
        )}
        {tab === "communication" && (
          <CommunicationTab value={state.communication} onChange={(value) => change("communication", value)}/>
        )}
        {tab === "launch" && (
          <LaunchWorkbookTab workbook={state.workbook} metrics={response.metrics} traffic={traffic} asin={response.identifier?.asin ?? null} lastSyncAt={response.workspace?.lastSyncAt ?? null} onChange={(value) => change("workbook", value)} onImport={importExcel}/>
        )}
        {tab === "ped" && (
          <PedTab value={state.ped} onChange={(value) => change("ped", value)}/>
        )}
        {tab === "images" && (
          <ImagesTab value={state.assets} onChange={(value) => change("assets", value)}/>
        )}
      </main>
    </div>
  </div>;
}
