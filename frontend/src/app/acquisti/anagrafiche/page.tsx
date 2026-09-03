"use client";
import { useState, useEffect, useCallback } from "react";
import { Users } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import FornitoriTab from "@/components/purchasing/FornitoriTab";
import ContactsTab from "@/components/purchasing/ContactsTab";
import TabsWithCount from "@/components/ui/TabsWithCount";
import { api } from "@/lib/api";

type AnagraficheTab = "fornitori" | "clienti" | "agenti";

export default function AnagrafichePage() {
  const [tab, setTab] = useState<AnagraficheTab>("fornitori");
  const [supplierCount, setSupplierCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [agentCount, setAgentCount] = useState(0);

  const loadCounts = useCallback(() => {
    api.suppliers.list().then(rows => setSupplierCount(rows.length)).catch(() => {});
    api.purchasing.businessContacts.list().then(rows => {
      setClientCount(rows.filter(r => r.type === "CLIENTE").length);
      setAgentCount(rows.filter(r => r.type === "AGENTE").length);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight">Anagrafiche</h1>
              <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
            </div>
            <TabsWithCount
              tabs={[
                { id: "fornitori", label: "Fornitori", count: supplierCount },
                { id: "clienti", label: "Clienti", count: clientCount },
                { id: "agenti", label: "Agenti", count: agentCount },
              ]}
              activeId={tab}
              onChange={id => setTab(id as AnagraficheTab)}
            />
            {tab === "fornitori" && <FornitoriTab />}
            {tab === "clienti" && <ContactsTab type="CLIENTE" basePath="/acquisti/anagrafiche/clienti" title="Clienti" />}
            {tab === "agenti" && <ContactsTab type="AGENTE" basePath="/acquisti/anagrafiche/agenti" title="Agenti" />}
          </main>
        </div>
      </div>
    </div>
  );
}
