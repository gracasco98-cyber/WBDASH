import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, Image as ImageIcon, Rocket, TrendingUp } from "lucide-react";
import type { TrafficMetric, WorkspaceMetric } from "@/lib/api";

export default function OverviewTab({ metrics, traffic, onOpen }: { metrics: WorkspaceMetric[]; traffic: TrafficMetric[]; onOpen: (tab: string) => void }) {
  const recent = metrics.slice(-30);
  const sales = recent.reduce((sum, row) => sum + row.sales, 0);
  const units = recent.reduce((sum, row) => sum + row.units, 0);
  const spend = recent.reduce((sum, row) => sum + row.ppcSpend, 0);
  const sessions = traffic.slice(-30).reduce((sum, row) => sum + row.sessions, 0);
  const conversion = sessions ? units / sessions * 100 : null;
  const max = Math.max(...recent.map((row) => row.sales), 1);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Kpi label="Vendite · 30 giorni" value={money(sales)} hint={`${units} unità`} icon={TrendingUp}/>
      <Kpi label="Spesa PPC" value={money(spend)} hint={sales ? `TACOS ${(spend / sales * 100).toFixed(1)}%` : "TACOS —"} icon={Rocket}/>
      <Kpi label="Sessioni" value={sessions ? sessions.toLocaleString("it-IT") : "—"} hint="Data Kiosk" icon={ArrowUpRight}/>
      <Kpi label="Conversione" value={conversion === null ? "—" : `${conversion.toFixed(2)}%`} hint="Unità / sessioni" icon={CheckCircle2}/>
    </div>
    <div className="grid xl:grid-cols-[1.55fr_1fr] gap-4">
      <section className="rounded-xl border border-bg-border bg-bg-card p-4">
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-zinc-100">Andamento vendite</h2><p className="text-[11px] text-zinc-500">Ricavi giornalieri degli ultimi 30 giorni</p></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400">Dati automatici</span></div>
        <div className="mt-6 flex h-44 items-end gap-1">{recent.length ? recent.map((row) => <div key={row.date} title={`${row.date}: ${money(row.sales)}`} className="group relative flex-1 rounded-t bg-accent-amber/40 hover:bg-accent-amber transition-colors" style={{ height: `${Math.max(3, row.sales / max * 100)}%` }}><span className="absolute opacity-0 group-hover:opacity-100 -top-6 left-1/2 -translate-x-1/2 rounded bg-black px-1.5 py-1 text-[9px] whitespace-nowrap">{money(row.sales)}</span></div>) : <div className="m-auto text-xs text-zinc-600">I dati appariranno dopo la prima sincronizzazione</div>}</div>
      </section>
      <section className="rounded-xl border border-bg-border bg-bg-card p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Prossime azioni</h2><div className="mt-3 space-y-2">
          <Action icon={FileText} label="Completa la comunicazione" detail="Titolo, bullet e descrizione" onClick={() => onOpen("communication")}/>
          <Action icon={Rocket} label="Controlla il piano lancio" detail="Costi, vendite e conversioni" onClick={() => onOpen("launch")}/>
          <Action icon={CalendarDays} label="Approva il PED" detail="Contenuti in calendario" onClick={() => onOpen("ped")}/>
          <Action icon={ImageIcon} label="Organizza gli asset" detail="Cartelle e versioni immagini" onClick={() => onOpen("images")}/>
        </div>
      </section>
    </div>
  </div>;
}
function money(value: number) { return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" }); }
function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof TrendingUp }) { return <div className="rounded-xl border border-bg-border bg-bg-card p-4"><div className="flex items-center justify-between text-zinc-500"><span className="text-[10px] uppercase tracking-wider">{label}</span><Icon size={16} className="text-accent-amber"/></div><div className="mt-2 text-xl font-semibold text-zinc-100 tabular-nums">{value}</div><div className="mt-1 text-[10px] text-zinc-500">{hint}</div></div>; }
function Action({ icon: Icon, label, detail, onClick }: { icon: typeof FileText; label: string; detail: string; onClick: () => void }) { return <button onClick={onClick} className="w-full flex items-center gap-3 rounded-lg border border-bg-border bg-bg-hover/40 p-3 text-left hover:border-accent-amber/30"><span className="rounded-lg bg-accent-amber/10 p-2 text-accent-amber"><Icon size={15}/></span><span className="flex-1"><b className="block text-xs font-medium text-zinc-200">{label}</b><small className="text-[10px] text-zinc-500">{detail}</small></span><ArrowUpRight size={14} className="text-zinc-600"/></button>; }
