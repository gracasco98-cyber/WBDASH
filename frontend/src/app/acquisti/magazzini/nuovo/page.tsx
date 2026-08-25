"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import WarehouseForm, { EMPTY_WAREHOUSE_FORM, WarehouseFormState } from "@/components/purchasing/WarehouseForm";
import { api } from "@/lib/api";

export default function NuovoMagazzinoPage() {
  const router = useRouter();

  const handleSubmit = async (form: WarehouseFormState) => {
    await api.purchasing.warehouses.create({ name: form.name, code: form.code, address: form.address || undefined });
    router.push("/acquisti/magazzini");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Magazzino</h1>
            <WarehouseForm initial={EMPTY_WAREHOUSE_FORM} submitLabel="Crea magazzino" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
