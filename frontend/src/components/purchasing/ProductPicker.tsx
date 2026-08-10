"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { PickerProduct } from "@/lib/api/purchase-orders";

interface Props {
  value: string | null;
  onChange: (product: PickerProduct | null) => void;
}

export default function ProductPicker({ value, onChange }: Props) {
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { api.purchaseOrders.products.listForPicker().then(setProducts).catch(() => {}); }, []);

  const selected = useMemo(() => products.find(p => p.id === value) ?? null, [products, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div className="relative">
      <input
        className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-primary/50 w-full"
        placeholder="Cerca prodotto…"
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-bg-border bg-bg-card shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-zinc-600">Nessun prodotto</div>}
          {filtered.map(p => (
            <button
              type="button"
              key={p.id}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-bg-hover"
              onMouseDown={() => { onChange(p); setOpen(false); }}
            >
              {p.name}{p.brand ? ` — ${p.brand}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
