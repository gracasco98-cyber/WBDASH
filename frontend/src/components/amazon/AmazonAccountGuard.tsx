"use client";
import { ReactNode } from "react";
import { Store } from "lucide-react";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";

/**
 * Blocks Amazon page content until the account context is resolved.
 * Every Amazon-only route requires an account in scope server-side
 * (AsyncLocalStorage) — without this guard, pages fire their data fetches
 * before the user picks an account and get uncaught 500s back.
 */
export default function AmazonAccountGuard({ children }: { children: ReactNode }) {
  const { accounts, selectedAccountId, needsSelection, loading, selectAccount } = useAmazonAccount();

  if (loading) return null;

  if (needsSelection && !selectedAccountId) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-amber/10 flex items-center justify-center">
          <Store size={20} className="text-accent-amber" />
        </div>
        <div>
          <p className="text-white font-semibold">Seleziona un account Amazon per continuare</p>
          <p className="text-sm text-zinc-500 mt-1">Hai più account collegati: scegline uno per vedere i dati.</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => selectAccount(a.id)}
              className="w-full px-4 py-2.5 rounded-lg border border-bg-border bg-bg-card hover:border-accent-amber/40 hover:text-white text-zinc-300 text-sm transition-colors"
            >
              {a.name} <span className="text-zinc-600">· {a.region}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
