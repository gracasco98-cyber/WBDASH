import { useContext } from "react";
import { PeriodContext, PeriodContextType } from "@/context/PeriodContext";

export function usePeriodFilter(): PeriodContextType {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error("usePeriodFilter must be used within PeriodProvider");
  }
  return context;
}
