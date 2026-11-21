import {
  AlertOctagon, ArrowUpRight, CalendarDays, CheckCircle2, Copy, FileText,
  Image as ImageIcon, Package, Rocket, ShieldAlert, TrendingUp,
} from "lucide-react";
import type { MarketingWorkspaceResponse, TrafficMetric, WorkspaceMetric } from "@/lib/api";

interface Props {
  product: MarketingWorkspaceResponse["product"];
  identifier: MarketingWorkspaceResponse["identifier"];
  workspace: MarketingWorkspaceResponse["workspace"];
  imageUrl: string | null | undefined;
  metrics: WorkspaceMetric[];
  traffic: TrafficMetric[];
  onOpen: (tab: string) => void;
}

export default function OverviewTab({ product, identifier, workspace, imageUrl, metrics, traffic, onOpen }: Props) {
  const recent = metrics.slice(-30);
  const sales = recent.reduce((sum, row) => sum + row.sales, 0);
  const units = recent.reduce((sum, row) => sum + row.units, 0);
  const spend = recent.reduce((sum, row) => sum + row.ppcSpend, 0);
  const sessions = traffic.slice(-30).reduce((sum, row) => sum + row.sessions, 0);
  const conversion = sessions ? units / sessions * 100 : null;
  const max = Math.max(...recent.map((row) => row.sales), 1);
  const lastSync = workspace?.lastSyncAt ? new Date(workspace.lastSyncAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "Mai eseguita";

  return <div className="space-y-5">
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,.05)]">
        <div className="grid gap-0 lg:grid-cols-[38%_29%_33%]">
          <div className="border-b border-slate-200 p-6 text-center lg:border-b-0 lg:border-r">
            <div className="mx-auto grid aspect-square max-w-[300px] place-items-center overflow-hidden rounded-[28px] border border-slate-200 bg-white p-7">
              {imageUrl ? <img src={imageUrl} alt={product.name} className="h-full w-full object-contain"/> : <Package size={70} strokeWidth={1.2} className="text-slate-300"/>}
            </div>
            <div className="mt-4 text-sm font-semibold text-slate-700">Foto della variante {identifier?.marketplace ?? "IT"}</div>
            <div className="mt-1 text-xs text-slate-500">Fonte automatica · Catalogo Amazon</div>
            <button onClick={() => onOpen("images")} className="mt-4 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50">Gestisci immagini</button>
          </div>
          <div className="border-b border-slate-200 p-7 lg:border-b-0 lg:border-r">
            <h3 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{product.name}</h3>
            <div className="mt-6 inline-flex rounded-full bg-amber-50 px-4 py-1.5 text-xs font-bold tracking-wider text-[#8a6508]">MASTER</div>
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-600"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100"><Package size={15}/></span>{product.brand ?? "Brand non assegnato"}</div>
            <dl className="mt-7 space-y-5 text-sm"><div><dt className="text-xs text-slate-500">Categoria</dt><dd className="mt-1 font-semibold tracking-wide text-slate-700">INTEGRATORI</dd></div><div><dt className="text-xs text-slate-500">Contesto lancio</dt><dd className="mt-1 leading-relaxed text-slate-600">Workspace operativo collegato ai dati Amazon e al piano marketing.</dd></div></dl>
            <div className="mt-7 flex flex-wrap gap-2"><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{product.name}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">Amazon</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">{identifier?.marketplace ?? "IT"}</span></div>
          </div>
          <div className="p-7">
            <InfoRow label="SKU principale" value={identifier?.sku ?? "—"} mono copy/>
            <InfoRow label="ASIN collegato" value={identifier?.asin ?? "—"} mono copy/>
            <InfoRow label="Brand" value={product.brand ?? "—"}/>
            <InfoRow label="Stato" value={identifier?.asin ? "Attivo in Anagrafica" : "ASIN da collegare"} success={!!identifier?.asin}/>
            <InfoRow label="Ultima sincronizzazione" value={lastSync}/>
            <div className="pt-5"><div className="text-xs text-slate-500">Mercato attivo</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs">{identifier?.marketplace ?? "—"}</span>Amazon {identifier?.marketplace ?? "non collegato"}</div></div>
          </div>
        </div>
      </section>

      <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,.05)]">
        <div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f3f0e7] text-[#8a6508]"><ShieldAlert size={22}/></span><div><h3 className="text-lg font-bold text-slate-900">Avvisi e attività</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Stato reale del prodotto, delle fonti e del lancio</p></div><span className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">{identifier?.asin && traffic.length ? 1 : 3}</span></div>
        <div className="mt-5 space-y-3">
          {!identifier?.asin && <AlertCard title="ASIN non collegato" detail="Collega un ASIN in Anagrafica per attivare import automatici e metriche giornaliere." action="Apri Anagrafica"/>}
          {identifier?.asin && !traffic.length && (
            <AlertCard title="Sessioni non ancora disponibili" detail="La fonte Data Kiosk verrà popolata con la prossima sincronizzazione del prodotto." action="Apri Lancio" onClick={() => onOpen("launch")}/>
          )}
          <AlertCard title="Controllo lancio aperto" detail="Verifica workbook, costi e avanzamento prima di confermare lo stato del prodotto." action="Apri Lancio" onClick={() => onOpen("launch")}/>
          {identifier?.asin && traffic.length > 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 size={17}/>Fonti Amazon attive</div><p className="mt-2 text-xs leading-relaxed text-emerald-700">Vendite, PPC, sessioni e conversione sono collegate all’ASIN {identifier.asin}.</p></div>}
        </div>
      </aside>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Vendite · 30 giorni" value={money(sales)} hint={`${units} unità`} icon={TrendingUp}/>
      <Kpi label="Spesa PPC" value={money(spend)} hint={sales ? `TACOS ${(spend / sales * 100).toFixed(1)}%` : "TACOS —"} icon={Rocket}/>
      <Kpi label="Sessioni" value={sessions ? sessions.toLocaleString("it-IT") : "—"} hint="SP-API Data Kiosk" icon={ArrowUpRight}/>
      <Kpi label="Conversione" value={conversion === null ? "—" : `${conversion.toFixed(2)}%`} hint="Unità / sessioni" icon={CheckCircle2}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">Andamento vendite</h3><p className="mt-1 text-xs text-slate-500">Ricavi giornalieri degli ultimi 30 giorni</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700">Dati automatici</span></div>
        <div className="mt-6 flex h-48 items-end gap-1.5">{recent.length ? recent.map((row) => <div key={row.date} title={`${row.date}: ${money(row.sales)}`} className="group relative flex-1 rounded-t-md bg-[#b49436]/35 transition hover:bg-[#9a7412]" style={{ height: `${Math.max(3, row.sales / max * 100)}%` }}><span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[9px] text-white group-hover:block">{money(row.sales)}</span></div>) : <div className="m-auto text-xs text-slate-400">I dati appariranno dopo la prima sincronizzazione</div>}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-bold text-slate-900">Prossime azioni</h3><div className="mt-4 space-y-2"><Action icon={FileText} label="Completa la comunicazione" detail="Titolo, bullet e descrizione" onClick={() => onOpen("communication")}/><Action icon={Rocket} label="Controlla il piano lancio" detail="Costi, vendite e conversioni" onClick={() => onOpen("launch")}/><Action icon={CalendarDays} label="Approva il PED" detail="Contenuti in calendario" onClick={() => onOpen("ped")}/><Action icon={ImageIcon} label="Organizza gli asset" detail="Cartelle e versioni immagini" onClick={() => onOpen("images")}/></div></section>
    </div>
  </div>;
}

function money(value: number) { return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" }); }
function InfoRow({ label, value, mono = false, copy = false, success = false }: { label: string; value: string; mono?: boolean; copy?: boolean; success?: boolean }) { return <div className="border-b border-slate-200 py-4 first:pt-0"><div className="text-xs text-slate-500">{label}</div><div className={`mt-2 flex items-center gap-2 text-sm font-semibold ${success ? "text-emerald-700" : "text-slate-800"} ${mono ? "font-mono tracking-wider" : ""}`}>{success && <span className="h-2 w-2 rounded-full bg-emerald-600"/>}{value}{copy && value !== "—" && <button title="Copia" className="text-slate-400"><Copy size={14}/></button>}</div></div>; }
function AlertCard({ title, detail, action, onClick }: { title: string; detail: string; action: string; onClick?: () => void }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-500"><AlertOctagon size={18}/></span><div><div className="text-sm font-bold text-slate-900">{title}</div><div className="mt-1 text-xs font-semibold text-red-500">Da verificare</div><p className="mt-2 text-xs leading-relaxed text-slate-600">{detail}</p><button onClick={onClick} className="mt-3 text-xs font-bold text-[#85640b]">{action} →</button></div></div></div>; }
function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof TrendingUp }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-slate-500"><span className="text-[10px] font-bold uppercase tracking-wider">{label}</span><Icon size={17} className="text-[#95700c]"/></div><div className="mt-3 text-xl font-bold tabular-nums text-slate-900">{value}</div><div className="mt-1 text-[10px] text-slate-500">{hint}</div></div>; }
function Action({ icon: Icon, label, detail, onClick }: { icon: typeof FileText; label: string; detail: string; onClick: () => void }) { return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-amber-300 hover:bg-amber-50/40"><span className="rounded-lg bg-[#f3f0e7] p-2 text-[#8a6508]"><Icon size={15}/></span><span className="flex-1"><b className="block text-xs font-semibold text-slate-800">{label}</b><small className="text-[10px] text-slate-500">{detail}</small></span><ArrowUpRight size={14} className="text-slate-400"/></button>; }
