"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { BusinessContact } from "@/lib/api/purchasing";
import PageHeader from "@/components/ui/PageHeader";
import TabsWithCount from "@/components/ui/TabsWithCount";

interface Props {
  type: string;
  basePath: string;
  title: string;
}

export default function ContactsTab({ type, basePath, title }: Props) {
  const [rows, setRows] = useState<BusinessContact[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const load = useCallback(() => { api.purchasing.businessContacts.list().then(setRows).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const typeRows = useMemo(() => rows.filter(r => r.type === type), [rows, type]);
  const activeCount = typeRows.filter(r => r.isActive).length;
  const inactiveCount = typeRows.filter(r => !r.isActive).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return typeRows
      .filter(r => (tab === "active" ? r.isActive : !r.isActive))
      .filter(r => !q || [r.name, r.referent, r.email, r.phone]
        .some(field => field?.toLowerCase().includes(q)));
  }, [typeRows, tab, search]);

  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        summary={`${typeRows.length} ${title.toLowerCase()}`}
        search={{ value: search, onChange: setSearch, placeholder: "Cerca nome, referente, email..." }}
        actions={
          <Link
            href={`${basePath}/nuovo`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
          >
            <Plus size={13} /> Nuovo
          </Link>
        }
      />

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
              <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Referente</th>
              <th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">Telefono</th>
              <th className="px-3 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 text-slate-700 hover:bg-emerald-50/30">
                <td className="px-3 py-2.5">
                  <Link href={`${basePath}/${r.id}`} className="font-medium text-emerald-700 hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.referent ?? "—"}</td>
                <td className="px-3 py-2.5">{r.email ?? "—"}</td>
                <td className="px-3 py-2.5">{r.phone ?? "—"}</td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nessun contatto trovato</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
