"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BankAccountForm, { BankAccountFormState } from "@/components/purchasing/BankAccountForm";
import { api } from "@/lib/api";
import type { BankAccount } from "@/lib/api/purchasing";

export default function ModificaContoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.bankAccounts.list()
      .then(rows => setAccount(rows.find(a => a.id === params.id) ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: BankAccountFormState) => {
    await api.purchasing.bankAccounts.update(params.id, {
      bankName: form.bankName, alias: form.alias, accountHolder: form.accountHolder,
      bic: form.bic || undefined, accountingCode: form.accountingCode || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/banche");
  };

  if (loading) return <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center text-slate-500 text-sm">Caricamento…</div>;
  if (!account) return <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center text-slate-500 text-sm">Conto non trovato</div>;

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">{account.alias}</h1>
            <BankAccountForm
              initial={{
                bankName: account.bankName, alias: account.alias, accountHolder: account.accountHolder,
                iban: account.iban, bic: account.bic ?? "", currency: account.currency,
                openingBalance: String(account.openingBalance), openingBalanceDate: account.openingBalanceDate.slice(0, 10),
                accountingCode: account.accountingCode ?? "", notes: account.notes ?? "",
              }}
              disableImmutableFields
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
