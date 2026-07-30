// lib/marketplaces.ts
import { fmtEur, fmtEurCompact } from "@/lib/fmt";

export const MARKETPLACE_META: Record<string, { label: string; color: string; bg: string }> = {
  REDCARE_IT:      { label: "Redcare IT",       color: "#ef4444", bg: "rgba(239,68,68,0.12)"    },
  REDCARE_DE:      { label: "Redcare DE",       color: "#dc2626", bg: "rgba(220,38,38,0.12)"    },
  TEMU_IT:         { label: "Temu IT",          color: "#f97316", bg: "rgba(249,115,22,0.12)"   },
  TEMU_ES:         { label: "Temu ES",          color: "#fb923c", bg: "rgba(251,146,60,0.12)"   },
  TEMU_FR:         { label: "Temu FR",          color: "#fbbf24", bg: "rgba(251,191,36,0.12)"   },
  TEMU_DE:         { label: "Temu DE",          color: "#f59e0b", bg: "rgba(245,158,11,0.12)"   },
  EBAY:            { label: "eBay",             color: "#3b82f6", bg: "rgba(59,130,246,0.12)"   },
  BENU_FARMA:      { label: "Benu Farma",       color: "#10b981", bg: "rgba(16,185,129,0.12)"   },
  TIKTOK:          { label: "TikTok",           color: "#a78bfa", bg: "rgba(167,139,250,0.12)"  },
  ALIEXPRESS:      { label: "AliExpress",       color: "#f59e0b", bg: "rgba(245,158,11,0.12)"   },
  SHOPIFY_DIRECT:  { label: "Shopify Diretto",  color: "#22c55e", bg: "rgba(34,197,94,0.12)"    },
  SITO:            { label: "Sito",             color: "#3b82f6", bg: "rgba(59,130,246,0.12)"    },
  UNCLASSIFIED:    { label: "Non class.",       color: "#6b7280", bg: "rgba(107,114,128,0.12)"  },
};

export function getMeta(marketplace: string) {
  return MARKETPLACE_META[marketplace] ?? {
    label: marketplace,
    color: "#6b7280",
    bg: "rgba(107,114,128,0.12)",
  };
}

export function formatEUR(value: number): string {
  return fmtEur(value);
}

export function formatCompact(value: number): string {
  return fmtEurCompact(value);
}
