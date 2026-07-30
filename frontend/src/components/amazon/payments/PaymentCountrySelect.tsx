"use client";

export type CountryKey = "EU" | "IT" | "DE" | "ES" | "FR";

interface Props {
  value: CountryKey;
  onChange: (v: CountryKey) => void;
}

export default function PaymentCountrySelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CountryKey)}
      className="px-2.5 py-1 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
    >
      <option value="EU">EU - Tutti</option>
      <option value="IT">Italia</option>
      <option value="DE">Germania</option>
      <option value="ES">Spagna</option>
      <option value="FR">Francia</option>
    </select>
  );
}
