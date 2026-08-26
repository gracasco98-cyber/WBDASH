"use client";
import { useState, useEffect, useCallback } from "react";
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
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Anagrafiche</h1>
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
