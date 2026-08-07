"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Store } from "lucide-react";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";

/**
 * Account switcher shown in the Amazon section header. Renders a static
 * badge (no dropdown) when there's 0 or 1 account — nothing to choose —
 * and a full selector once 2+ accounts exist, per useAmazonAccount().needsSelection.
 */
export default function AmazonAccountSelector() {
  const { accounts, selectedAccount, needsSelection, selectAccount, loading } = useAmazonAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return null;

  if (!needsSelection) {
    // 0 or 1 account: static badge, same as before account selection existed
    return (
      <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
        <span>{selectedAccount?.name ?? "Amazon"}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg border border-bg-border bg-bg-card hover:border-zinc-600 transition-all"
      >
        <Store size={12} className="text-accent-amber" />
        <span className="hidden sm:inline text-xs text-zinc-300 max-w-[140px] truncate">
          {selectedAccount?.name ?? "Tutti gli account"}
        </span>
        <ChevronDown size={11} className={`text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-hidden">
          <div className="px-3.5 py-2 border-b border-bg-border">
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Account Amazon</p>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            <button
              onClick={() => { selectAccount(null); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-bg-base/60 transition-colors text-left border-b border-bg-border"
            >
              <span className="truncate">Tutti gli account</span>
              {selectedAccount === null && <Check size={13} className="text-accent-amber shrink-0" />}
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => { selectAccount(a.id); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-bg-base/60 transition-colors text-left"
              >
                <span className="truncate">
                  {a.name} <span className="text-zinc-600">· {a.region}</span>
                </span>
                {selectedAccount?.id === a.id && <Check size={13} className="text-accent-amber shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
