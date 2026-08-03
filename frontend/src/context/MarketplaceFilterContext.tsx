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
  const [marketplace, setMarketplaceState] = useState<string>(() => getStoredMarketplace());

  const setMarketplace = useCallback((value: string) => {
    setStoredMarketplace(value);
    setMarketplaceState(value);
  }, []);

  useEffect(() => onMarketplaceChange((value) => setMarketplaceState(value)), []);

  return (
    <MarketplaceFilterContext.Provider value={{ marketplace, setMarketplace }}>
      {children}
    </MarketplaceFilterContext.Provider>
  );
}
