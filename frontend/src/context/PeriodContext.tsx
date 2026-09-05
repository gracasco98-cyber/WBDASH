"use client";
import React, { createContext, useState, useCallback, ReactNode } from "react";

export type PeriodPreset = "today" | "yesterday" | "last7" | "last14" | "last30" | "month_to_date" | "last_month" | "custom";
export type CompareMode = "none" | "previous_period" | "same_period_last_year";

export interface PeriodState {
  preset: PeriodPreset;
  from: string;
  to: string;
  compareMode: CompareMode;
}

export interface PeriodContextType {
  state: PeriodState;
  setPreset: (preset: PeriodPreset) => void;
  setDateRange: (from: string, to: string) => void;
  setCompareMode: (mode: CompareMode) => void;
  reset: () => void;
}

const defaultState: PeriodState = {
  preset: "today",
  from: "",
  to: "",
  compareMode: "none",
};

export const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PeriodState>(defaultState);

  const setPreset = useCallback((preset: PeriodPreset) => {
    setState(prev => ({
      ...prev,
      preset,
      from: "",
      to: "",
    }));
  }, []);

  const setDateRange = useCallback((from: string, to: string) => {
    setState(prev => ({
      ...prev,
      preset: "custom",
      from,
      to,
    }));
  }, []);

  const setCompareMode = useCallback((compareMode: CompareMode) => {
    setState(prev => ({
      ...prev,
      compareMode,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  const value: PeriodContextType = {
    state,
    setPreset,
    setDateRange,
    setCompareMode,
    reset,
  };

  return (
    <PeriodContext.Provider value={value}>
      {children}
    </PeriodContext.Provider>
  );
}
