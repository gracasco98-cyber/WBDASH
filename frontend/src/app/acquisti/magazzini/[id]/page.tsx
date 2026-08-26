"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import WarehouseForm, { WarehouseFormState } from "@/components/purchasing/WarehouseForm";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/api/purchasing";

export default function ModificaMagazzinoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.warehouses.list()
      .then(rows => setWarehouse(rows.find(w => w.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: WarehouseFormState) => {
    await api.purchasing.warehouses.update(params.id, { name: form.name, address: form.address || undefined });
    router.push("/acquisti/magazzini");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!warehouse) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Magazzino non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{warehouse.name}</h1>
            <WarehouseForm
              initial={{ name: warehouse.name, code: warehouse.code, address: warehouse.address ?? "" }}
              disableCode
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
