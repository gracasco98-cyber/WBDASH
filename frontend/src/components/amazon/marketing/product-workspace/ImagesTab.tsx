"use client";

import { useState } from "react";
import { ExternalLink, FileImage, Folder, Grid3X3, Link2, Plus, Trash2, Upload } from "lucide-react";

export interface Asset { id: string; name: string; url: string; folder: string; createdAt: string; }
export interface AssetsData { folders: string[]; items: Asset[]; }

export default function ImagesTab({ value, onChange }: { value: AssetsData; onChange: (value: AssetsData) => void }) {
  const [folder, setFolder] = useState("Tutti"); const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "", folder: value.folders[0] ?? "Listing" });
  const items = folder === "Tutti" ? value.items : value.items.filter((item) => item.folder === folder);
  function add() {
    if (!draft.name || !draft.url) return;
    onChange({ ...value, items: [...value.items, { ...draft, id: `${Date.now()}`, createdAt: new Date().toISOString() }] });
    setDraft({ ...draft, name: "", url: "" }); setShowAdd(false);
  }
  return <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cartelle</div>{["Tutti", ...value.folders].map((name) => <button key={name} onClick={() => setFolder(name)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition ${folder === name ? "bg-[#f3f0e7] font-bold text-[#806008]" : "text-slate-600 hover:bg-slate-50"}`}><Folder size={15}/>{name}<span className="ml-auto text-[10px] text-slate-400">{name === "Tutti" ? value.items.length : value.items.filter((item) => item.folder === name).length}</span></button>)}</aside>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5"><div><h2 className="text-sm font-bold text-slate-900">{folder}</h2><p className="mt-1 text-[11px] text-slate-500">Libreria immagini organizzata come un drive</p></div><button onClick={() => setShowAdd((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-[#94710e] px-4 py-2.5 text-xs font-bold text-white"><Upload size={14}/>Aggiungi asset</button></div>
      {showAdd && <div className="grid gap-2 border-b border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1.5fr_150px_auto]"><input className="form-field" placeholder="Nome file" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/><input className="form-field" placeholder="URL immagine o Drive" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })}/><select className="form-field" value={draft.folder} onChange={(e) => setDraft({ ...draft, folder: e.target.value })}>{value.folders.map((name) => <option key={name}>{name}</option>)}</select><button onClick={add} className="rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800">Salva</button></div>}
      {items.length ? <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-4">{items.map((item) => <div key={item.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"><div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-50"><FileImage className="absolute text-slate-200" size={42}/><img src={item.url} alt={item.name} className="relative h-full w-full object-contain p-2" onError={(event) => { event.currentTarget.style.display = "none"; }}/></div><div className="border-t border-slate-100 p-3"><div className="truncate text-xs font-bold text-slate-800">{item.name}</div><div className="mt-1 text-[10px] text-slate-500">{item.folder}</div><div className="mt-3 flex gap-3"><a href={item.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-amber-700"><ExternalLink size={14}/></a><button onClick={() => onChange({ ...value, items: value.items.filter((row) => row.id !== item.id) })} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></div></div></div>)}</div> : <div className="py-24 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100"><Grid3X3 className="text-slate-400"/></span><p className="mt-4 text-xs font-semibold text-slate-600">Nessun asset in questa cartella</p><p className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-400"><Link2 size={11}/>Aggiungi un URL immagine o Drive</p><button onClick={() => setShowAdd(true)} className="mx-auto mt-5 flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Plus size={13}/>Nuovo asset</button></div>}
    </section>
  </div>;
}
