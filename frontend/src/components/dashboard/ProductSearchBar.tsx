"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Search, X, Package, ShoppingBag, ChevronRight } from "lucide-react";
import { fmtEur } from "@/lib/fmt";
import { SelectedProduct } from "./ProductBIOverview";

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchResult = {
  id: string;
  title: string;
  sku: string | null;
  asin?: string;
  shopifyProductId?: string;
  source: "amazon" | "shopify";
  marketplace: string;
  revenue: number;
};

interface Props {
  onSelect: (product: SelectedProduct | null) => void;
  selected: SelectedProduct | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductSearchBar({ onSelect, selected }: Props) {
  const [query,     setQuery]     = useState(selected?.title ?? "");
  const [results,   setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open,      setOpen]      = useState(false);

  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout>>();

  // Sync query when selected changes externally (e.g. cleared from parent)
  useEffect(() => {
    if (!selected) setQuery("");
  }, [selected]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const [amzRes, shopRes] = await Promise.allSettled([
        api.amazon.products({ search: q, filter: "last30", sortBy: "grossRevenue", sortDir: "desc" }),
        api.products({ search: q, filter: "last30", sortBy: "grossRevenue", sortDir: "desc" }),
      ]);

      const merged: SearchResult[] = [];

      if (amzRes.status === "fulfilled") {
        const list: any[] = (amzRes.value as any).products ?? [];
        const seen = new Set<string>();
        for (const p of list) {
          if (merged.length >= 6) break;
          if (!seen.has(p.asin)) {
            seen.add(p.asin);
            merged.push({ id: `amz_${p.asin}`, title: p.productTitle, sku: p.sku ?? null, asin: p.asin, source: "amazon", marketplace: p.marketplace, revenue: p.grossRevenue });
          }
        }
      }

      if (shopRes.status === "fulfilled") {
        const list: any[] = (shopRes.value as any).products ?? [];
        const seen = new Set<string>();
        for (const p of list) {
          if (merged.length >= 9) break;
          if (!seen.has(p.shopifyProductId)) {
            seen.add(p.shopifyProductId);
            merged.push({ id: `shop_${p.shopifyProductId}`, title: p.productTitle, sku: p.sku ?? null, shopifyProductId: p.shopifyProductId, source: "shopify", marketplace: p.marketplace, revenue: p.grossRevenue });
          }
        }
      }

      setResults(merged);
      setOpen(merged.length > 0);
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!selected) debounceRef.current = setTimeout(() => doSearch(query), 320);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch, selected]);

  const selectProduct = (item: SearchResult) => {
    setOpen(false);
    setQuery(item.title);
    onSelect({
      id:                item.id,
      asin:              item.asin,
      shopifyProductId:  item.shopifyProductId,
      title:             item.title,
      source:            item.source,
      marketplace:       item.marketplace,
    });
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 bg-bg-card border rounded-xl px-3 py-2.5 transition-colors ${
        open ? "border-accent-primary/50" : "border-bg-border focus-within:border-accent-primary/40"
      }`}>
        <Search size={13} className="text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); if (selected) onSelect(null); }}
          onFocus={() => results.length > 0 && !selected && setOpen(true)}
          placeholder="Cerca prodotto per titolo o ASIN…"
          className="flex-1 bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-600 outline-none min-w-0"
        />
        {searching && (
          <div className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-accent-primary rounded-full animate-spin shrink-0" />
        )}
        {selected && !searching && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
            selected.source === "amazon" ? "bg-amber-500/10 text-amber-500" : "bg-accent-primary/10 text-accent-primary"
          }`}>
            {selected.source === "amazon" ? "Amzn" : "Shop"}
          </span>
        )}
        {(query || selected) && !searching && (
          <button onClick={clear} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0 p-0.5">
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-bg-card border border-bg-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-bg-border/50">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
              {results.length} risultat{results.length === 1 ? "o" : "i"}
            </span>
          </div>
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => selectProduct(r)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left border-b border-bg-border/30 last:border-0"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                r.source === "amazon" ? "bg-amber-500/15" : "bg-accent-primary/15"
              }`}>
                {r.source === "amazon"
                  ? <Package     size={11} className="text-amber-400" />
                  : <ShoppingBag size={11} className="text-accent-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate leading-tight">{r.title}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1.5">
                  {r.asin
                    ? <span>ASIN: <span className="font-mono">{r.asin}</span></span>
                    : <span>SKU: {r.sku ?? "—"}</span>}
                  <span>·</span><span>{r.marketplace}</span>
                  <span>·</span><span className="text-zinc-500">{fmtEur(r.revenue)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                  r.source === "amazon" ? "bg-amber-500/10 text-amber-500" : "bg-accent-primary/10 text-accent-primary"
                }`}>
                  {r.source === "amazon" ? "Amzn" : "Shop"}
                </span>
                <ChevronRight size={10} className="text-zinc-700" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
