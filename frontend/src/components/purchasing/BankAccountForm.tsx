"use client";
import { useEffect, useState } from "react";

export interface BankAccountFormState {
  bankName: string; alias: string; accountHolder: string; iban: string; bic: string;
  currency: string; openingBalance: string; openingBalanceDate: string;
  accountingCode: string; notes: string;
}

export const EMPTY_BANK_ACCOUNT_FORM: BankAccountFormState = {
  bankName: "", alias: "", accountHolder: "", iban: "", bic: "",
  currency: "EUR", openingBalance: "0", openingBalanceDate: "",
  accountingCode: "", notes: "",
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
      <div className="pb-2 border-b border-bg-border">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {note && <p className="text-[10px] text-zinc-500 mt-0.5">{note}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-zinc-400 flex flex-col gap-1">
      {label}
      {children}
    </label>
  );
}

const inputClass = "bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50";

interface Props {
  initial?: Partial<BankAccountFormState>;
  disableImmutableFields?: boolean;
  submitLabel: string;
  onSubmit: (data: BankAccountFormState) => Promise<void>;
}

export default function BankAccountForm({ initial, disableImmutableFields, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<BankAccountFormState>({ ...EMPTY_BANK_ACCOUNT_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_BANK_ACCOUNT_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof BankAccountFormState>(key: K, value: BankAccountFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Identificazione">
        <Field label="Banca *"><input required className={inputClass} value={form.bankName} onChange={e => set("bankName", e.target.value)} /></Field>
        <Field label="Alias *"><input required className={inputClass} value={form.alias} onChange={e => set("alias", e.target.value)} /></Field>
        <Field label="Intestatario *"><input required className={inputClass} value={form.accountHolder} onChange={e => set("accountHolder", e.target.value)} /></Field>
        <Field label="IBAN *"><input required disabled={disableImmutableFields} className={inputClass} value={form.iban} onChange={e => set("iban", e.target.value)} /></Field>
        <Field label="BIC/SWIFT"><input className={inputClass} value={form.bic} onChange={e => set("bic", e.target.value)} /></Field>
        <Field label="Valuta"><input disabled={disableImmutableFields} className={inputClass} value={form.currency} onChange={e => set("currency", e.target.value)} /></Field>
      </Section>

      <Section title="Saldo iniziale" note={disableImmutableFields ? "Il saldo iniziale non è modificabile dopo la creazione" : undefined}>
        <Field label="Saldo iniziale *"><input required type="number" step="0.01" disabled={disableImmutableFields} className={inputClass} value={form.openingBalance} onChange={e => set("openingBalance", e.target.value)} /></Field>
        <Field label="Data saldo iniziale *"><input required type="date" disabled={disableImmutableFields} className={inputClass} value={form.openingBalanceDate} onChange={e => set("openingBalanceDate", e.target.value)} /></Field>
      </Section>

      <Section title="Altro">
        <Field label="Codice contabile"><input className={inputClass} value={form.accountingCode} onChange={e => set("accountingCode", e.target.value)} /></Field>
        <Field label="Note"><input className={inputClass} value={form.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </Section>

      {error && <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{error}</div>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-accent-primary text-bg-base text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "Salvataggio…" : submitLabel}
      </button>
    </form>
  );
}
