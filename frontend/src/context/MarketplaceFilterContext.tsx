"use client";
import React, { createContext, useState, useCallback, useEffect, ReactNode } from "react";
import {
  getStoredMarketplace,
  setStoredMarketplace,
  onMarketplaceChange,
} from "@/lib/marketplaceFilterStorage";

export interface MarketplaceFilterContextType {
  marketplace: string;
  setMarketplace: (value: string) => void;
}

export const MarketplaceFilterContext = createContext<MarketplaceFilterContextType | undefined>(undefined);

export function MarketplaceFilterProvider({ children }: { children: ReactNode }) {
  // Starts at the same default Next.js' SSR pass always sees ("all", since
  // getStoredMarketplace() has no localStorage to read server-side) rather
  // than reading storage synchronously here — that would make the client's
  // very first render disagree with the server-rendered HTML and throw a
  // hydration-mismatch error. The real stored value (if any) is adopted in
  // the effect below, safely after hydration completes.
  const [marketplace, setMarketplaceState] = useState<string>("all");

  const setMarketplace = useCallback((value: string) => {
    setStoredMarketplace(value);
    setMarketplaceState(value);
  }, []);

  useEffect(() => {
    setMarketplaceState(getStoredMarketplace());
    return onMarketplaceChange((value) => setMarketplaceState(value));
  }, []);

  return (
    <MarketplaceFilterContext.Provider value={{ marketplace, setMarketplace }}>
      {children}
    </MarketplaceFilterContext.Provider>
  );
}
