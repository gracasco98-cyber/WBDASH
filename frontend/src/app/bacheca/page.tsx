"use client";
import { Activity, Archive, ArrowUpRight, Boxes, CalendarClock, ClipboardList, LayoutGrid, Pin, Plus, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BachecaBoard from "@/components/bacheca/BachecaBoard";

export default function BachecaPage() {
  const quickLinks = [
    { label: "Amazon", description: "Ordini, pagamenti e performance", href: "/amazon", icon: ShoppingCart, tone: "text-accent-amber" },
    { label: "Amazon P&L", description: "Margini e redditività", href: "/amazon/pl", icon: Activity, tone: "text-accent-primary" },
    { label: "Amazon Inventario", description: "Giacenze e riordini", href: "/amazon/inventory", icon: Boxes, tone: "text-accent-blue" },
    { label: "Prima Nota", description: "Movimenti e saldi banca", href: "/acquisti/prima-nota", icon: Wallet, tone: "text-accent-purple" },
    { label: "Scadenzario", description: "Prossime scadenze", href: "/acquisti/scadenzario", icon: CalendarClock, tone: "text-accent-red" },
    { label: "Ordini fornitore", description: "Acquisti e consegne", href: "/acquisti/ordini", icon: ClipboardList, tone: "text-accent-amber" },
  ];
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="min-h-[calc(100vh-57px)] bg-bg-base px-4 md:px-8 py-6">
            <div className="max-w-[1600px] mx-auto space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="flex items-center gap-2 text-accent-primary text-[10px] font-bold uppercase tracking-[.14em]"><Pin size={14}/> Workspace personale</div><h1 className="text-2xl font-bold text-zinc-100 mt-1">La tua bacheca</h1><p className="text-xs text-zinc-500 mt-1">Un unico punto di accesso per task, KPI e operatività quotidiana.</p></div>
                <div className="flex items-center gap-2"><button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border bg-bg-card text-xs font-medium text-zinc-500 hover:text-zinc-100"><LayoutGrid size={14}/> Gestisci layout</button><button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold hover:opacity-90"><Plus size={14}/> Nuova nota</button></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{quickLinks.map(link => <a key={link.href} href={link.href} className="group rounded-xl border border-bg-border bg-bg-card p-3.5 hover:border-accent-primary/40 hover:-translate-y-0.5 transition-all"><div className="flex items-start justify-between"><link.icon size={17} className={link.tone}/><ArrowUpRight size={13} className="text-zinc-600 group-hover:text-accent-primary"/></div><div className="text-xs font-semibold text-zinc-100 mt-3">{link.label}</div><div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{link.description}</div></a>)}</div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold"><span>Widget operativi</span><div className="h-px bg-bg-border flex-1"/><span className="normal-case tracking-normal font-normal">Trascina per riorganizzare</span></div>
              <BachecaBoard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
