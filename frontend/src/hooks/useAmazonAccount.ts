import { useContext } from "react";
import { AmazonAccountContext, AmazonAccountContextType } from "@/context/AmazonAccountContext";

export function useAmazonAccount(): AmazonAccountContextType {
  const context = useContext(AmazonAccountContext);
  if (!context) {
    throw new Error("useAmazonAccount must be used within AmazonAccountProvider");
  }
  return context;
}
