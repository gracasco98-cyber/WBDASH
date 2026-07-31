"use client";
import React, { createContext, useState, useCallback, useEffect, ReactNode } from "react";
import { api } from "@/lib/api";
import type { AmazonAccountSummary } from "@/lib/api/types";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getStoredAmazonAccountId,
  setStoredAmazonAccountId,
  onAmazonAccountChange,
} from "@/lib/amazonAccountStorage";

export interface AmazonAccountContextType {
  accounts: AmazonAccountSummary[];
  /** null = no selection made yet, or only one account exists (nothing to choose) */
  selectedAccountId: string | null;
  selectedAccount: AmazonAccountSummary | null;
  loading: boolean;
  /** True once >1 active account exists — selector only needs to be shown then. */
  needsSelection: boolean;
  selectAccount: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export const AmazonAccountContext = createContext<AmazonAccountContextType | undefined>(undefined);

export function AmazonAccountProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<AmazonAccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.amazon.listAccounts();
      setAccounts(list);
      // Reconcile the stored selection against the live account list: drop it
      // if it no longer exists, and default to the only account when there's
      // exactly one (keeps single-account setups selection-free).
      const stored = getStoredAmazonAccountId();
      if (stored && list.some((a) => a.id === stored)) {
        setSelectedAccountId(stored);
      } else if (list.length === 1) {
        setSelectedAccountId(list[0].id);
        setStoredAmazonAccountId(list[0].id);
      } else {
        setSelectedAccountId(null);
        if (stored) setStoredAmazonAccountId(null);
      }
    } catch (e) {
      console.error("[AmazonAccountContext] Failed to load accounts:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for AuthProvider to confirm the session first: while it's still
    // checking, `user` reads as null the same as "logged out" would, and
    // resolving early on that false signal used to let Amazon pages mount
    // and fire their data fetches with no account context yet — a burst of
    // doomed "No Amazon account in scope" 500s on every fresh page load.
    if (authLoading) return;
    if (user) {
      refresh();
    } else {
      setAccounts([]);
      setSelectedAccountId(null);
      setLoading(false);
    }
    return onAmazonAccountChange((id) => setSelectedAccountId(id));
  }, [user, authLoading, refresh]);

  const selectAccount = useCallback((id: string | null) => {
    // Every Amazon-touching page fetches its own data with its own
    // useEffect/useState, independent of account selection — a plain state
    // update here would leave already-loaded pages showing the PREVIOUS
    // account's data until the user changes some other filter. A full
    // reload is the simplest way to guarantee every page re-fetches with
    // the new amazonAccountId, without threading account-change reactions
    // through ~10 independent pages individually.
    const changed = id !== selectedAccountId;
    setStoredAmazonAccountId(id);
    setSelectedAccountId(id);
    if (changed && typeof window !== "undefined") {
      window.location.reload();
    }
  }, [selectedAccountId]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  const value: AmazonAccountContextType = {
    accounts,
    selectedAccountId,
    selectedAccount,
    loading,
    needsSelection: accounts.length > 1,
    selectAccount,
    refresh,
  };

  return (
    <AmazonAccountContext.Provider value={value}>
      {children}
    </AmazonAccountContext.Provider>
  );
}
