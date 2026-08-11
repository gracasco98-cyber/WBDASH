"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import SupplierForm, { EMPTY_SUPPLIER_FORM, SupplierFormState } from "@/components/purchasing/SupplierForm";
import { api } from "@/lib/api";

export default function NuovoFornitorePage() {
  const router = useRouter();

  const handleSubmit = async (form: SupplierFormState) => {
    const supplier = await api.suppliers.create({
      ...form,
      paymentDays: form.paymentDays ? Number(form.paymentDays) : null,
      defaultPaymentMethod: form.defaultPaymentMethod || null,
    });
    router.push(`/acquisti/fornitori/${supplier.id}`);
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Fornitore</h1>
            <SupplierForm initial={EMPTY_SUPPLIER_FORM} submitLabel="Crea Fornitore" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
