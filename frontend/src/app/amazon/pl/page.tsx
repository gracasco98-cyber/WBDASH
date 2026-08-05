"use client";
import { useState, useEffect, useCallback } from "react";
import { api, AmazonPLResponse, AmazonPLMonth } from "@/lib/api";
import { TrendingUp, TrendingDown, Download, Globe, RefreshCw, Info } from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";

const MARKETPLACES = [
  { value: "all", label: "Tutti" },
  { value: "IT",  label: "🇮🇹 Italia" },
  { value: "DE",  label: "🇩🇪 Germania" },
  { value: "ES",  label: "🇪🇸 Spagna" },
  { value: "UK",  label: "🇬🇧 UK" },
];
function fmtPct(v: number) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
}

type CellType = "revenue" | "cost" | "profit" | "neutral" | "percent";

function Cell({ v, type = "neutral", bold }: { v: number | null; type?: CellType; bold?: boolean }) {
  if (v === null) return <td className="px-3 py-2.5 text-right text-zinc-600 tabular-nums">—</td>;
  const color = type === "revenue" ? "text-white"
              : type === "cost"    ? "text-red-400"
              : type === "profit"  ? v >= 0 ? "text-emerald-400" : "text-red-400"
              : type === "percent" ? v >= 0 ? "text-emerald-400" : "text-red-400"
              : "text-zinc-300";
  const display = type === "percent" ? fmtPct(v) : fmtEur(v);
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums text-sm ${color} ${bold ? "font-semibold" : ""}`}>
      {display}
    </td>
  );
}

function TotalsRow({ data }: { data: any }) {
  return (
    <tr className="border-t-2 border-zinc-600 bg-bg-hover font-semibold">
      <td className="px-3 py-3 text-zinc-200 font-bold text-sm sticky left-0 bg-bg-hover">TOTALE</td>
      <Cell v={data.grossRevenue}  type="revenue" bold />
      <Cell v={-data.refunds}      type="cost"    bold />
      <Cell v={data.netSales}      type="revenue" bold />
      <Cell v={-data.amazonFees}   type="cost"    bold />
      <Cell v={-data.adSpend}      type="cost"    bold />
      <Cell v={-data.cogsTotal}    type="cost"    bold />
      <Cell v={data.grossProfit}   type="profit"  bold />
      <Cell v={data.netProfit}     type="profit"  bold />
      <Cell v={data.margin}        type="percent" bold />
      <Cell v={data.roi}           type="percent" bold />
      <td className="px-3 py-3 text-right text-zinc-300 tabular-nums text-sm font-semibold">
        {data.orderCount.toLocaleString("it-IT")}
      </td>
      <td className="px-3 py-3 text-right text-zinc-300 tabular-nums text-sm font-semibold">
        {data.unitsSold.toLocaleString("it-IT")}
      </td>
    </tr>
  );
}

export default function PLPage() {
  const [marketplace, setMarketplace] = useState("all");
  const [months,      setMonths]      = useState("12");
  const [data,        setData]        = useState<AmazonPLResponse | null>(null);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { months };
      if (marketplace !== "all") params.marketplace = marketplace;
      setData(await api.amazon.pl(params));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [marketplace, months]);

  useEffect(() => { load(); }, [load]);

  const months_data = data?.months ?? [];
  const totals      = data?.totals;

  function exportCSV() {
    if (!months_data.length) return;
    const header = "Mese,Vendite,Resi,Vendite Nette,Commissioni Amazon,Ad Spend,COGS,Utile Lordo,Utile Netto,Margine %,ROI %,Ordini,Unità";
    const rows = months_data.map((m) =>
      [monthLabel(m.month), m.grossRevenue.toFixed(2), m.refunds.toFixed(2), m.netSales.toFixed(2),
       m.amazonFees.toFixed(2), m.adSpend.toFixed(2), m.cogsTotal.toFixed(2),
       m.grossProfit.toFixed(2), m.netProfit.toFixed(2), m.margin.toFixed(1),
       m.roi?.toFixed(1) ?? "", m.orderCount, m.unitsSold].join(",")
    );
    const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `amazon_pl_${months}mesi.csv`; a.click();
  }

  const COLS = [
    { label: "Mese",             tip: "" },
    { label: "Vendite",          tip: "Fatturato lordo da ordini non annullati" },
    { label: "Resi / Ann.",      tip: "Importo resi e ordini annullati" },
    { label: "Vendite Nette",    tip: "Vendite − Resi" },
    { label: "Fee Amazon",       tip: "Commissioni referral + FBA + storage/altre fee (da settlement reale, o stimate al 15% + €3,80/unità se settlement non disponibile)" },
    { label: "Ad Spend",         tip: "PPC da settlement EU (importo reale addebitato) quando disponibile, altrimenti da AmazonAdSnapshot" },
    { label: "COGS",             tip: "Costo del venduto (da configurazione prodotti)" },
    { label: "Utile Lordo",      tip: "Vendite Nette − Fee Amazon − COGS" },
    { label: "Utile Netto",      tip: "Utile Lordo − Ad Spend" },
    { label: "Margine %",        tip: "Utile Netto / Vendite Nette" },
    { label: "ROI %",            tip: "Utile Netto / COGS" },
    { label: "Ordini",           tip: "" },
    { label: "Unità",            tip: "" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Conto Economico (P&L)</h1>
          <p className="text-sm text-zinc-500 mt-1">Analisi finanziaria mensile · Profitto e perdita Amazon</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={months} onChange={(e) => setMonths(e.target.value)}
            className="bg-bg-card border border-bg-border text-zinc-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="3">3 mesi</option>
            <option value="6">6 mesi</option>
            <option value="12">12 mesi</option>
            <option value="24">24 mesi</option>
          </select>
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-lg px-2 py-1.5">
            <Globe size={13} className="text-zinc-500" />
            <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}
              className="bg-transparent text-sm text-zinc-300 outline-none cursor-pointer">
              {MARKETPLACES.map((m) => <option key={m.value} value={m.value} className="bg-bg-card">{m.label}</option>)}
            </select>
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/20 transition-colors">
            <Download size={13} /> CSV
          </button>
          <button onClick={load}
            className="p-1.5 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      {totals && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {[
            { label: "Vendite Totali",    value: fmtEur(totals.grossRevenue), color: "text-white"       },
            { label: "Utile Netto",       value: fmtEur(totals.netProfit),    color: totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Margine Netto",     value: fmtPct(totals.margin),    color: totals.margin >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "ROI",               value: totals.roi !== null ? fmtPct(totals.roi) : "—", color: (totals.roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Fee Amazon",        value: fmtEur(totals.amazonFees),   color: "text-red-400"     },
            { label: "COGS Totale",       value: fmtEur(totals.cogsTotal),    color: "text-orange-400"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg-card border border-bg-border rounded-xl p-4">
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
              <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* P&L Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="border-b border-bg-border bg-bg-hover">
                {COLS.map((c) => (
                  <th key={c.label} className={`px-3 py-3 ${c.label === "Mese" ? "text-left sticky left-0 bg-bg-hover" : "text-right"} text-zinc-500 font-medium uppercase tracking-wide whitespace-nowrap`}>
                    <span className="flex items-center gap-1 justify-end">
                      {c.label}
                      {c.tip && <span title={c.tip}><Info size={10} className="text-zinc-600" /></span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/40">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {COLS.map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-3 bg-bg-border rounded animate-pulse w-16 ml-auto" /></td>
                    ))}
                  </tr>
                ))
              ) : months_data.length === 0 ? (
                <tr><td colSpan={COLS.length} className="px-4 py-12 text-center text-zinc-600">Nessun dato disponibile</td></tr>
              ) : (
                <>
                  {months_data.map((m) => (
                    <tr key={m.month} className="hover:bg-bg-hover transition-colors">
                      <td className="px-3 py-2.5 text-zinc-300 font-medium sticky left-0 bg-bg-card">
                        {monthLabel(m.month)}
                        {!m.hasRealFees && <span className="ml-1 text-amber-400/60 text-[10px]">~</span>}
                      </td>
                      <Cell v={m.grossRevenue}  type="revenue" />
                      <Cell v={-m.refunds}       type="cost"    />
                      <Cell v={m.netSales}       type="revenue" />
                      <Cell v={-m.amazonFees}    type="cost"    />
                      <Cell v={-m.adSpend}       type="cost"    />
                      <Cell v={-m.cogsTotal}     type="cost"    />
                      <Cell v={m.grossProfit}    type="profit"  />
                      <Cell v={m.netProfit}      type="profit"  bold />
                      <Cell v={m.margin}         type="percent" />
                      <Cell v={m.roi}            type="percent" />
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{m.orderCount.toLocaleString("it-IT")}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{m.unitsSold.toLocaleString("it-IT")}</td>
                    </tr>
                  ))}
                  {totals && <TotalsRow data={totals} />}
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-bg-border text-xs text-zinc-600 flex flex-wrap gap-3">
          <span>~ = fee stimate (referral 15% + €3,80/unità FBA). Con dati settlement reali le fee sono esatte e includono commissioni, FBA, storage e altre fee EU.</span>
          <span>Ad Spend = PPC da settlement (importo reale) quando disponibile, altrimenti da AmazonAdSnapshot.</span>
          <span>ROI = Utile Netto / COGS. Richiede COGS configurati.</span>
        </div>
      </div>
    </div>
  );
}
