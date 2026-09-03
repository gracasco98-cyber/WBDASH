"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/api/suppliers";
import PageHeader from "@/components/ui/PageHeader";
import { StatTile, StatTileRow } from "@/components/ui/StatTile";
import TabsWithCount from "@/components/ui/TabsWithCount";

export default function FornitoriTab() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const load = useCallback(() => { api.suppliers.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const activeCount = rows.filter(r => r.isActive).length;
  const inactiveCount = rows.filter(r => !r.isActive).length;
  const missingPaymentTermCount = rows.filter(r => !r.defaultPaymentTerm).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => (tab === "active" ? r.isActive : !r.isActive))
      .filter(r => !q || [r.legalName, r.tradeName, r.internalCode, r.vatNumber]
        .some(field => field?.toLowerCase().includes(q)));
  }, [rows, tab, search]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fornitori"
        summary={`${rows.length} fornitori · ${missingPaymentTermCount} senza condizione pagamento`}
        subtitle="Anagrafica fornitori: dati fiscali, pagamenti e prodotti collegati."
        search={{ value: search, onChange: setSearch, placeholder: "Cerca nome, codice, P.IVA..." }}
        actions={
          <Link
            href="/acquisti/fornitori/nuovo"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
          >
            <Plus size={13} /> Nuovo Fornitore
          </Link>
        }
      />

      <StatTileRow>
        <StatTile value={activeCount} label="Attivi" tone="primary" />
        <StatTile value={inactiveCount} label="Disattivati" tone="neutral" />
        <StatTile value={missingPaymentTermCount} label="Senza condizione pagamento" tone="amber" />
      </StatTileRow>

      <TabsWithCount
        tabs={[
          { id: "active", label: "Attivi", count: activeCount },
          { id: "inactive", label: "Disattivati", count: inactiveCount },
        ]}
        activeId={tab}
        onChange={id => setTab(id as "active" | "inactive")}
      />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2.5">Fornitore</th><th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">P.IVA</th><th className="px-3 py-2.5">Condizione</th>
              <th className="px-3 py-2.5">Prodotti</th><th className="px-3 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
                <td className="px-3 py-2.5">
                  <Link href={`/acquisti/fornitori/${r.id}`} className="font-medium text-emerald-700 hover:underline">{r.legalName}</Link>
                  <div className="text-[10px] text-slate-500 font-mono">{r.internalCode}</div>
                </td>
                <td className="px-3 py-2.5">{r.supplierType}</td>
                <td className="px-3 py-2.5 font-mono">{r.vatNumber ?? r.foreignVatNumber ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {r.defaultPaymentTerm ? r.defaultPaymentTerm.name : <span className="text-amber-600">— mancante</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${r._count.products > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {r._count.products > 0 ? r._count.products : "Nessuno"}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-8">Nessun fornitore trovato</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
