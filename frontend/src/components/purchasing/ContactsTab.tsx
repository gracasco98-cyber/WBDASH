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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
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

      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
              <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Referente</th>
              <th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">Telefono</th>
              <th className="px-3 py-2.5">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-bg-border/40 text-zinc-300 hover:bg-bg-hover/50">
                <td className="px-3 py-2.5">
                  <Link href={`${basePath}/${r.id}`} className="font-medium text-accent-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2.5">{r.referent ?? "—"}</td>
                <td className="px-3 py-2.5">{r.email ?? "—"}</td>
                <td className="px-3 py-2.5">{r.phone ?? "—"}</td>
                <td className="px-3 py-2.5">{r.isActive ? "Attivo" : "Disattivato"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-600 py-8">Nessun contatto trovato</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
