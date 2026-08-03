import { useContext } from "react";
import { MarketplaceFilterContext, MarketplaceFilterContextType } from "@/context/MarketplaceFilterContext";

export function useMarketplaceFilter(): MarketplaceFilterContextType {
  const context = useContext(MarketplaceFilterContext);
  if (!context) {
    throw new Error("useMarketplaceFilter must be used within MarketplaceFilterProvider");
  }
  return context;
}
