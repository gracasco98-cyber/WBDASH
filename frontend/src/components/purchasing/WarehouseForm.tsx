"use client";
import { useEffect, useState } from "react";

export interface WarehouseFormState {
  name: string; code: string; address: string;
}

export const EMPTY_WAREHOUSE_FORM: WarehouseFormState = { name: "", code: "", address: "" };

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
  initial?: Partial<WarehouseFormState>;
  disableCode?: boolean;
  submitLabel: string;
  onSubmit: (data: WarehouseFormState) => Promise<void>;
}

export default function WarehouseForm({ initial, disableCode, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<WarehouseFormState>({ ...EMPTY_WAREHOUSE_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...EMPTY_WAREHOUSE_FORM, ...initial });
  }, [initial]);

  const set = <K extends keyof WarehouseFormState>(key: K, value: WarehouseFormState[K]) =>
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
      <Section title="Magazzino">
        <Field label="Nome *"><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Codice *"><input required disabled={disableCode} className={inputClass} value={form.code} onChange={e => set("code", e.target.value)} /></Field>
        <Field label="Indirizzo"><input className={inputClass} value={form.address} onChange={e => set("address", e.target.value)} /></Field>
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
