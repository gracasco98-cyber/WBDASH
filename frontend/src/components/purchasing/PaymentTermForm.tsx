"use client";
import { useEffect, useState } from "react";
import { computePaymentSchedule } from "@/lib/payment-schedule";

export interface PaymentTermInstallmentFormRow {
  installmentNumber: number; offsetDays: string; percentage: string;
}

export interface PaymentTermFormState {
  name: string; type: string; endOfMonth: boolean; fixedDay: string;
  paymentMethod: string; installments: PaymentTermInstallmentFormRow[];
}

export const EMPTY_PAYMENT_TERM_FORM: PaymentTermFormState = {
  name: "", type: "", endOfMonth: false, fixedDay: "", paymentMethod: "",
  installments: [{ installmentNumber: 1, offsetDays: "30", percentage: "100" }],
};

const PAYMENT_METHODS = ["", "BONIFICO", "RIBA", "ASSEGNO", "CONTANTI", "PAYPAL", "CARTA", "ALTRO"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-slate-500 flex flex-col gap-1">
      {label}
      {children}
    </label>
  );
}

const inputClass = "bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400";

interface Props {
  initial?: Partial<PaymentTermFormState>;
  submitLabel: string;
  onSubmit: (data: PaymentTermFormState) => Promise<void>;
}

export default function PaymentTermForm({ initial, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<PaymentTermFormState>({ ...EMPTY_PAYMENT_TERM_FORM, ...initial });
  const [sampleAmount, setSampleAmount] = useState("1000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_PAYMENT_TERM_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof PaymentTermFormState>(key: K, value: PaymentTermFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setInstallment = (index: number, key: keyof PaymentTermInstallmentFormRow, value: string) =>
    setForm(prev => ({
      ...prev,
      installments: prev.installments.map((inst, i) => i === index ? { ...inst, [key]: value } : inst),
    }));

  const addInstallment = () =>
    setForm(prev => ({
      ...prev,
      installments: [...prev.installments, { installmentNumber: prev.installments.length + 1, offsetDays: "0", percentage: "0" }],
    }));

  const removeInstallment = (index: number) =>
    setForm(prev => ({
      ...prev,
      installments: prev.installments.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, installmentNumber: i + 1 })),
    }));

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

  const percentageSum = form.installments.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
  const allValid = form.installments.every(
    i => i.offsetDays !== "" && i.percentage !== "" && !Number.isNaN(Number(i.offsetDays)) && !Number.isNaN(Number(i.percentage))
  ) && Math.abs(percentageSum - 100) < 0.01;
  const preview = allValid
    ? computePaymentSchedule(
        new Date(),
        {
          endOfMonth: form.endOfMonth,
          fixedDay: form.fixedDay ? Number(form.fixedDay) : null,
          installments: form.installments.map(i => ({
            installmentNumber: i.installmentNumber, offsetDays: Number(i.offsetDays), percentage: Number(i.percentage),
          })),
        },
        Number(sampleAmount) || 0
      )
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Condizione">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome *"><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
          <Field label="Tipo *"><input required className={inputClass} value={form.type} onChange={e => set("type", e.target.value)} placeholder="es. RIBA, BONIFICO, IMMEDIATE" /></Field>
          <Field label="Metodo di pagamento *">
            <select required className={inputClass} value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m || "—"}</option>)}
            </select>
          </Field>
          <Field label="Giorno fisso"><input type="number" className={inputClass} value={form.fixedDay} onChange={e => set("fixedDay", e.target.value)} /></Field>
          <Field label="Fine mese">
            <input type="checkbox" checked={form.endOfMonth} onChange={e => set("endOfMonth", e.target.checked)} className="w-4 h-4" />
          </Field>
        </div>
      </Section>

      <Section title="Rate">
        <div className="space-y-2">
          {form.installments.map((inst, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={`Rata ${inst.installmentNumber} — giorni`}>
                <input type="number" className={inputClass} value={inst.offsetDays} onChange={e => setInstallment(i, "offsetDays", e.target.value)} />
              </Field>
              <Field label="Percentuale">
                <input type="number" step="0.01" className={inputClass} value={inst.percentage} onChange={e => setInstallment(i, "percentage", e.target.value)} />
              </Field>
              <button
                type="button"
                onClick={() => removeInstallment(i)}
                disabled={form.installments.length === 1}
                className="text-rose-600 text-xs px-2 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={addInstallment} className="text-xs text-emerald-700 hover:underline">+ Aggiungi rata</button>
          <p className={`text-xs ${Math.abs(percentageSum - 100) < 0.01 ? "text-slate-500" : "text-rose-600"}`}>
            Totale percentuali: {percentageSum.toFixed(2)}%
          </p>
        </div>
      </Section>

      <Section title="Anteprima">
        <div className="space-y-2">
          <Field label="Importo di esempio">
            <input type="number" className={`${inputClass} max-w-[160px]`} value={sampleAmount} onChange={e => setSampleAmount(e.target.value)} />
          </Field>
          {preview ? (
            <div className="border-l-2 border-emerald-500 pl-3 space-y-1 text-xs text-slate-500">
              {preview.map(p => (
                <div key={p.installmentNumber}>
                  Rata {p.installmentNumber} — <span className="text-slate-700">€ {p.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span> il{" "}
                  <span className="text-emerald-700">{p.dueDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Completa le rate per vedere l&apos;anteprima</p>
          )}
        </div>
      </Section>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Salvataggio…" : submitLabel}
      </button>
    </form>
  );
}
