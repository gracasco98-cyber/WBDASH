"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BankAccountForm, { EMPTY_BANK_ACCOUNT_FORM, BankAccountFormState } from "@/components/purchasing/BankAccountForm";
import { api } from "@/lib/api";

export default function NuovoContoPage() {
  const router = useRouter();

  const handleSubmit = async (form: BankAccountFormState) => {
    await api.purchasing.bankAccounts.create({
      bankName: form.bankName, alias: form.alias, accountHolder: form.accountHolder, iban: form.iban,
      bic: form.bic || undefined, currency: form.currency || undefined,
      openingBalance: Number(form.openingBalance), openingBalanceDate: form.openingBalanceDate,
      accountingCode: form.accountingCode || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/banche");
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">Nuovo Conto Banca</h1>
            <BankAccountForm initial={EMPTY_BANK_ACCOUNT_FORM} submitLabel="Crea conto" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
