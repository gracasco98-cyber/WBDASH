"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Boxes, ClipboardList, LayoutDashboard, PackageCheck, Plus, RefreshCw, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

type Area = "overview" | "stock" | "movements" | "receipts" | "transfers";
const AREAS: Array<{ id: Area; label: string; icon: typeof Boxes }> = [
  { id: "overview", label: "Panoramica", icon: LayoutDashboard },
  { id: "stock", label: "Giacenze", icon: Boxes },
  { id: "movements", label: "Movimenti", icon: RefreshCw },
  { id: "receipts", label: "Ricezioni / DDT", icon: PackageCheck },
  { id: "transfers", label: "Trasferimenti", icon: Truck },
];

export default function MagazzinoWorkspace() {
  const [area, setArea] = useState<Area>("overview");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedId, setSelectedId] = useState("all");
  useEffect(() => { api.purchasing.warehouses.list().then(setWarehouses).catch(() => setWarehouses([])); }, []);
  const selected = warehouses.find(w => w.id === selectedId);
  const totalOrders = useMemo(() => warehouses.reduce((sum, w) => sum + w._count.purchaseOrders, 0), [warehouses]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Aree magazzino">
        {AREAS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setArea(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${area === id ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}><Icon size={14} />{label}</button>)}
      </nav>
      <div className="flex items-center gap-2"><select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700"><option value="all">Tutti i magazzini</option>{warehouses.map(w => <option value={w.id} key={w.id}>{w.code} · {w.name}</option>)}</select><Link href="/acquisti/magazzini/nuovo" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><Plus size={14} /> Nuovo</Link></div>
    </div>

    {area === "overview" && <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ label: "Magazzini attivi", value: String(warehouses.filter(w => w.isActive).length), icon: WarehouseIcon, tone: "text-slate-900" }, { label: "Ordini collegati", value: String(selected ? selected._count.purchaseOrders : totalOrders), icon: ClipboardList, tone: "text-blue-700" }, { label: "Ingressi da verificare", value: "—", icon: ArrowDownToLine, tone: "text-amber-700" }, { label: "Uscite periodo", value: "—", icon: ArrowUpFromLine, tone: "text-rose-600" }].map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>{label}</span><Icon size={15} className={tone} /></div><div className={`mt-2 text-xl font-bold tabular-nums ${tone}`}>{value}</div></div>)}
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Rete magazzini</h2><p className="text-xs text-slate-500 mt-1">Ogni sede collega ordini, ricezioni e movimenti.</p></div><Boxes size={18} className="text-emerald-600" /></div><div className="mt-4 space-y-2">{warehouses.map(w => <button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full flex items-center justify-between rounded-lg border p-3 text-left ${selectedId === w.id ? "border-emerald-300 bg-emerald-50/60" : "border-slate-100 hover:bg-slate-50"}`}><span><span className="block text-sm font-semibold text-slate-800">{w.code} · {w.name}</span><span className="text-xs text-slate-500">{w.address ?? "Indirizzo non configurato"}</span></span><span className="text-right"><span className="block text-sm font-bold text-slate-800">{w._count.purchaseOrders}</span><span className="text-[10px] text-slate-500">ordini</span></span></button>)}{warehouses.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nessun magazzino configurato.</p>}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-bold text-slate-900">Flusso operativo</h2><p className="text-xs text-slate-500 mt-1">Segui il ciclo completo senza perdere il collegamento contabile.</p><div className="mt-5 space-y-3">{[{ label: "Ordini fornitore", href: "/acquisti/ordini", icon: ClipboardList, note: "Pianifica gli ingressi" }, { label: "Ricezioni / DDT", href: "/acquisti/ordini", icon: PackageCheck, note: "Conferma quantità e discrepanze" }, { label: "Prima Nota", href: "/acquisti/prima-nota", icon: ArrowRight, note: "Registra l'impatto finanziario" }].map(({ label, href, icon: Icon, note }) => <Link key={label} href={href} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:border-emerald-200 hover:bg-emerald-50/40"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></span><span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="text-xs text-slate-500">{note}</span></span><ArrowRight size={15} className="ml-auto text-slate-400" /></Link>)}</div></div>
      </section>
    </>}
    {area !== "overview" && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Boxes size={22} /></div><h2 className="mt-3 text-base font-bold text-slate-900">{AREAS.find(item => item.id === area)?.label}</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Questa sotto-area è pronta come workspace dedicato. I dati verranno collegati agli ordini e alle ricezioni nel prossimo passaggio.</p><div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><ArrowRight size={14} /> Modulo in collegamento</div></div>}
  </div>;
}
