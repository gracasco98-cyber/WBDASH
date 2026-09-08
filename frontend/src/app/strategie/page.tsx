"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, Plus, Sparkles, Target, Upload, X } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api, type Strategy, type StrategyObjective } from "@/lib/api";

const eur = new Intl.NumberFormat("it-IT");
const priorityClass = { HIGH: "text-red-300 bg-red-400/10", MEDIUM: "text-amber-300 bg-amber-400/10", LOW: "text-zinc-400 bg-zinc-400/10" };

export default function StrategiePage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [fileData, setFileData] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.strategies.list().then(({ strategies: rows }) => { setStrategies(rows); setSelected(current => current ? rows.find(r => r.id === current.id) ?? current : rows[0] ?? null); }).catch(() => setError("Impossibile recuperare le strategie.")).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const completed = useMemo(() => selected?.objectives.filter(o => o.completed).length ?? 0, [selected]);

  const chooseFile = (next: File | null) => {
    setFile(next); setError(null); setFileData(undefined);
    if (!next) return setContent("");
    const allowed = /\.(pdf|txt|md|csv|json)$/i.test(next.name);
    if (!allowed) return setError("Sono supportati PDF, TXT, Markdown, CSV e JSON.");
    if (/\.pdf$/i.test(next.name) || next.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => setFileData(String(reader.result ?? ""));
      reader.onerror = () => setError("Impossibile leggere il PDF.");
      reader.readAsDataURL(next);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.onerror = () => setError("Impossibile leggere il file.");
    reader.readAsText(next);
  };
  const analyze = async () => {
    if (!file || (!content.trim() && !fileData) || !title.trim()) return;
    setAnalyzing(true); setError(null);
    try { const row = await api.strategies.analyze({ title: title.trim(), fileName: file.name, mimeType: file.type || "text/plain", fileSize: file.size, content: fileData ? undefined : content, fileData }); setStrategies(rows => [row, ...rows.filter(r => r.id !== row.id)]); setSelected(row); setShowUpload(false); setTitle(""); setFile(null); setContent(""); setFileData(undefined); }
    catch { setError("Impossibile analizzare la strategia. Riprova."); }
    finally { setAnalyzing(false); }
  };
  const toggleObjective = async (objective: StrategyObjective, index: number) => {
    if (!selected) return;
    const next = { ...selected, objectives: selected.objectives.map((item, i) => i === index ? { ...item, completed: !objective.completed } : item) };
    setSelected(next); setStrategies(rows => rows.map(row => row.id === next.id ? next : row));
    try { const saved = await api.strategies.setObjectiveDone(selected.id, index, !objective.completed); setSelected(saved); setStrategies(rows => rows.map(row => row.id === saved.id ? saved : row)); } catch { setError("Impossibile aggiornare l'obiettivo."); }
  };

  return <div className="min-h-screen bg-bg-base"><AppHeader accentColor="primary" /><div className="flex"><GlobalSidebar /><main className="flex-1 min-w-0"><div className="mx-auto max-w-[1450px] px-4 py-6 md:px-8 md:py-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-accent-primary"><Sparkles size={13} /> Strategic workspace</div><h1 className="mt-1 text-2xl font-bold text-white">Strategie</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">Carica una strategia, lascia che l’AI ne estragga il concetto guida e mantieni visibili gli obiettivi dei prossimi mesi.</p></div><button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90"><Plus size={15} /> Carica strategia</button></div>
    {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">{error}</div>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="rounded-2xl border border-bg-border bg-bg-card p-3"><div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Archivio strategie</div>{loading ? <div className="p-4 text-xs text-zinc-600">Caricamento...</div> : strategies.length === 0 ? <div className="p-5 text-center text-xs text-zinc-600">Nessuna strategia caricata.</div> : <div className="space-y-1">{strategies.map(row => <button key={row.id} onClick={() => setSelected(row)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selected?.id === row.id ? "border-accent-primary/30 bg-accent-primary/10" : "border-transparent hover:bg-bg-hover"}`}><div className="flex items-start gap-2"><FileText size={15} className="mt-0.5 shrink-0 text-accent-primary" /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-200">{row.title}</span></div><div className="mt-1 pl-5 text-[10px] text-zinc-600">{row.fileName} · {row.status === "READY" ? "Analizzata" : "Da verificare"}</div></button>)}</div>}</aside>
      <section className="min-w-0 rounded-2xl border border-bg-border bg-bg-card p-5 md:p-7">{selected ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-600"><FileText size={13} /> {selected.fileName}</div><h2 className="mt-2 text-xl font-semibold text-white">{selected.title}</h2></div><div className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-3 py-1 text-[10px] font-semibold text-accent-primary">{completed}/{selected.objectives.length} obiettivi completati</div></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-bg-border bg-bg-base p-4"><div className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Sparkles size={14} className="text-accent-primary" /> Concetto guida</div><p className="mt-3 text-sm leading-relaxed text-zinc-400">{selected.coreConcept || "Nessun concetto estratto."}</p></div><div className="rounded-xl border border-bg-border bg-bg-base p-4"><div className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Target size={14} className="text-accent-amber" /> Sintesi strategica</div><p className="mt-3 text-sm leading-relaxed text-zinc-400">{selected.summary || "Nessuna sintesi disponibile."}</p></div></div><div className="mt-7"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Obiettivi dei prossimi mesi</h3><p className="mt-1 text-xs text-zinc-600">Segna ogni obiettivo mentre lo porti avanti.</p></div></div><div className="space-y-2">{selected.objectives.map((objective, index) => <button key={`${selected.id}-${index}`} onClick={() => toggleObjective(objective, index)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${objective.completed ? "border-accent-primary/20 bg-accent-primary/5" : "border-bg-border hover:border-accent-primary/30 hover:bg-bg-hover"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${objective.completed ? "border-accent-primary bg-accent-primary text-white" : "border-zinc-700 text-transparent"}`}><Check size={12} /></span><span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${objective.completed ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{objective.title}</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">{objective.description}</span></span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${priorityClass[objective.priority] ?? priorityClass.MEDIUM}`}>{objective.horizonMonths} mesi</span></button>)}</div></div></> : <div className="flex min-h-[440px] flex-col items-center justify-center text-center"><Target size={34} className="text-zinc-700" /><h2 className="mt-4 text-lg font-semibold text-zinc-300">Il tuo archivio strategico</h2><p className="mt-2 max-w-md text-sm text-zinc-600">Carica il primo documento per trasformarlo in una direzione chiara e in obiettivi verificabili.</p><button onClick={() => setShowUpload(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-accent-primary/30 px-3 py-2 text-xs font-semibold text-accent-primary"><Upload size={14} /> Carica documento</button></div>}</section></div>
  </div></main></div>{showUpload && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-lg rounded-2xl border border-bg-border bg-bg-card p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-base font-semibold text-white">Carica una strategia</h2><p className="mt-1 text-xs text-zinc-500">L’AI analizzerà il contenuto e proporrà obiettivi a 1–12 mesi.</p></div><button onClick={() => setShowUpload(false)}><X size={16} className="text-zinc-500" /></button></div><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome della strategia" className="mt-5 w-full rounded-lg border border-bg-border bg-bg-hover px-3 py-2.5 text-sm text-white" /><label className="mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-bg-border bg-bg-base px-4 py-8 text-center hover:border-accent-primary/40"><Upload size={20} className="text-accent-primary" /><span className="mt-2 text-sm font-medium text-zinc-300">{file ? file.name : "Scegli un file"}</span><span className="mt-1 text-xs text-zinc-600">PDF, TXT, Markdown, CSV o JSON</span><input type="file" accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,application/json" className="hidden" onChange={e => chooseFile(e.target.files?.[0] ?? null)} /></label><button onClick={analyze} disabled={analyzing || !file || (!content.trim() && !fileData) || !title.trim()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-primary py-2.5 text-xs font-semibold text-white disabled:opacity-40">{analyzing ? <><Loader2 size={14} className="animate-spin" /> Analisi AI in corso...</> : <><Sparkles size={14} /> Studia strategia</>}</button></div></div>}</div>;
}
