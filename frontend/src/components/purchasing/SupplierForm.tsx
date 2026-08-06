"use client";
import { useState } from "react";

export interface SupplierFormState {
  legalName: string; tradeName: string; internalCode: string; supplierType: string;
  country: string; language: string; defaultCurrency: string;
  vatNumber: string; taxCode: string; foreignVatNumber: string; sdiCode: string; pec: string; taxRegime: string; fiscalNotes: string;
  addressLine: string; streetNumber: string; postalCode: string; city: string; province: string; addressCountry: string;
  defaultPaymentMethod: string; paymentDays: string; bankName: string; iban: string; bic: string; ribaEnabled: boolean;
}

export const EMPTY_SUPPLIER_FORM: SupplierFormState = {
  legalName: "", tradeName: "", internalCode: "", supplierType: "", country: "IT", language: "it", defaultCurrency: "EUR",
  vatNumber: "", taxCode: "", foreignVatNumber: "", sdiCode: "", pec: "", taxRegime: "", fiscalNotes: "",
  addressLine: "", streetNumber: "", postalCode: "", city: "", province: "", addressCountry: "IT",
  defaultPaymentMethod: "", paymentDays: "", bankName: "", iban: "", bic: "", ribaEnabled: false,
};

const PAYMENT_METHODS = ["", "BONIFICO", "RIBA", "ASSEGNO", "CONTANTI", "PAYPAL", "CARTA", "ALTRO"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white pb-2 border-b border-bg-border">{title}</h2>
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
  initial?: Partial<SupplierFormState>;
  disableInternalCode?: boolean;
  submitLabel: string;
  onSubmit: (data: SupplierFormState) => Promise<void>;
}

export default function SupplierForm({ initial, disableInternalCode, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<SupplierFormState>({ ...EMPTY_SUPPLIER_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) =>
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
        <Field label="Ragione sociale *"><input required className={inputClass} value={form.legalName} onChange={e => set("legalName", e.target.value)} /></Field>
        <Field label="Nome commerciale"><input className={inputClass} value={form.tradeName} onChange={e => set("tradeName", e.target.value)} /></Field>
        <Field label="Codice interno *"><input required disabled={disableInternalCode} className={inputClass} value={form.internalCode} onChange={e => set("internalCode", e.target.value)} /></Field>
        <Field label="Tipologia fornitore *"><input required className={inputClass} value={form.supplierType} onChange={e => set("supplierType", e.target.value)} placeholder="es. Produttore, Distributore" /></Field>
        <Field label="Nazione *"><input required className={inputClass} value={form.country} onChange={e => set("country", e.target.value)} /></Field>
        <Field label="Lingua"><input className={inputClass} value={form.language} onChange={e => set("language", e.target.value)} /></Field>
        <Field label="Valuta predefinita"><input className={inputClass} value={form.defaultCurrency} onChange={e => set("defaultCurrency", e.target.value)} /></Field>
      </Section>

      <Section title="Dati fiscali">
        <Field label="Partita IVA"><input className={inputClass} value={form.vatNumber} onChange={e => set("vatNumber", e.target.value)} /></Field>
        <Field label="Codice fiscale"><input className={inputClass} value={form.taxCode} onChange={e => set("taxCode", e.target.value)} /></Field>
        <Field label="VAT number estero"><input className={inputClass} value={form.foreignVatNumber} onChange={e => set("foreignVatNumber", e.target.value)} /></Field>
        <Field label="Codice SDI"><input className={inputClass} value={form.sdiCode} onChange={e => set("sdiCode", e.target.value)} /></Field>
        <Field label="PEC"><input type="email" className={inputClass} value={form.pec} onChange={e => set("pec", e.target.value)} /></Field>
        <Field label="Regime fiscale"><input className={inputClass} value={form.taxRegime} onChange={e => set("taxRegime", e.target.value)} /></Field>
        <Field label="Note fiscali"><input className={inputClass} value={form.fiscalNotes} onChange={e => set("fiscalNotes", e.target.value)} /></Field>
      </Section>

      <Section title="Indirizzo">
        <Field label="Indirizzo"><input className={inputClass} value={form.addressLine} onChange={e => set("addressLine", e.target.value)} /></Field>
        <Field label="Civico"><input className={inputClass} value={form.streetNumber} onChange={e => set("streetNumber", e.target.value)} /></Field>
        <Field label="CAP"><input className={inputClass} value={form.postalCode} onChange={e => set("postalCode", e.target.value)} /></Field>
        <Field label="Città"><input className={inputClass} value={form.city} onChange={e => set("city", e.target.value)} /></Field>
        <Field label="Provincia"><input className={inputClass} value={form.province} onChange={e => set("province", e.target.value)} /></Field>
        <Field label="Nazione"><input className={inputClass} value={form.addressCountry} onChange={e => set("addressCountry", e.target.value)} /></Field>
      </Section>

      <Section title="Pagamenti">
        <Field label="Modalità predefinita">
          <select className={inputClass} value={form.defaultPaymentMethod} onChange={e => set("defaultPaymentMethod", e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m || "—"}</option>)}
          </select>
        </Field>
        <Field label="Giorni pagamento"><input type="number" className={inputClass} value={form.paymentDays} onChange={e => set("paymentDays", e.target.value)} /></Field>
        <Field label="Banca fornitore"><input className={inputClass} value={form.bankName} onChange={e => set("bankName", e.target.value)} /></Field>
        <Field label="IBAN"><input className={inputClass} value={form.iban} onChange={e => set("iban", e.target.value)} /></Field>
        <Field label="BIC/SWIFT"><input className={inputClass} value={form.bic} onChange={e => set("bic", e.target.value)} /></Field>
        <Field label="Abilitato Ri.Ba.">
          <input type="checkbox" checked={form.ribaEnabled} onChange={e => set("ribaEnabled", e.target.checked)} className="w-4 h-4" />
        </Field>
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
