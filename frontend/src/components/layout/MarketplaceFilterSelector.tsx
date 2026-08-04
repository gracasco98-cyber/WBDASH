"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Globe2 } from "lucide-react";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { AMAZON_CHANNEL_MAP } from "@/components/dashboard/FilterBar";
import { MARKETPLACE_META } from "@/lib/marketplaces";

const AMAZON_OPTIONS = Object.entries(AMAZON_CHANNEL_MAP).map(([value, code]) => ({
  value,
  label: `Amazon ${code}`,
}));
const SHOPIFY_OPTIONS = Object.entries(MARKETPLACE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export default function MarketplaceFilterSelector() {
  const { marketplace, setMarketplace } = useMarketplaceFilter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLabel = marketplace === "all"
    ? "Tutti i canali"
    : AMAZON_OPTIONS.find(o => o.value === marketplace)?.label
      ?? SHOPIFY_OPTIONS.find(o => o.value === marketplace)?.label
      ?? marketplace;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border border-bg-border bg-bg-card hover:border-zinc-600 transition-all"
      >
        <Globe2 size={12} className="text-accent-primary" />
        <span className="hidden sm:inline text-xs text-zinc-300 max-w-[140px] truncate">{currentLabel}</span>
        <ChevronDown size={11} className={`text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-hidden">
          <div className="py-1 max-h-80 overflow-y-auto">
            <button
              onClick={() => { setMarketplace("all"); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-bg-base/60 transition-colors text-left"
            >
              Tutti i canali
              {marketplace === "all" && <Check size={13} className="text-accent-primary shrink-0" />}
            </button>
            <div className="px-3.5 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide border-t border-bg-border mt-1">Amazon</div>
            {AMAZON_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => { setMarketplace(o.value); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-bg-base/60 transition-colors text-left"
              >
                {o.label}
                {marketplace === o.value && <Check size={13} className="text-accent-primary shrink-0" />}
              </button>
            ))}
            <div className="px-3.5 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide border-t border-bg-border mt-1">Altri canali</div>
            {SHOPIFY_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => { setMarketplace(o.value); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-bg-base/60 transition-colors text-left"
              >
                {o.label}
                {marketplace === o.value && <Check size={13} className="text-accent-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
