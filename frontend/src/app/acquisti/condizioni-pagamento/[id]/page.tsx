"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import PaymentTermForm, { PaymentTermFormState } from "@/components/purchasing/PaymentTermForm";
import { api } from "@/lib/api";
import type { PaymentTerm, PaymentTermInput } from "@/lib/api/purchasing";

function toApiInput(form: PaymentTermFormState): PaymentTermInput {
  return {
    name: form.name, type: form.type, endOfMonth: form.endOfMonth,
    fixedDay: form.fixedDay ? Number(form.fixedDay) : undefined,
    paymentMethod: form.paymentMethod,
    installments: form.installments.map(i => ({
      installmentNumber: i.installmentNumber, offsetDays: Number(i.offsetDays), percentage: Number(i.percentage),
    })),
  };
}

export default function ModificaCondizionePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [term, setTerm] = useState<PaymentTerm | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.paymentTerms.list()
      .then(rows => setTerm(rows.find(t => t.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: PaymentTermFormState) => {
    await api.purchasing.paymentTerms.update(params.id, toApiInput(form));
    router.push("/acquisti/condizioni-pagamento");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!term) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Condizione non trovata</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{term.name}</h1>
            <PaymentTermForm
              initial={{
                name: term.name, type: term.type, endOfMonth: term.endOfMonth,
                fixedDay: term.fixedDay !== null ? String(term.fixedDay) : "",
                paymentMethod: term.paymentMethod,
                installments: term.installments.map(i => ({
                  installmentNumber: i.installmentNumber, offsetDays: String(i.offsetDays), percentage: String(i.percentage),
                })),
              }}
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
