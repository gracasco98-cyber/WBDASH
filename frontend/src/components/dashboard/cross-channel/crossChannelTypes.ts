// ── Types and constants for CrossChannelProducts ─────────────────────────────

export type MetricId =
  | "revenue" | "orders" | "units" | "adSpend" | "margin"
  | "refunds" | "sales" | "promo" | "percentRefunds"
  | "sellableReturns" | "refundCost" | "amazonFees"
  | "costOfGoods" | "grossProfit" | "netProfit"
  | "estimatedPayout" | "expenses" | "roi"
  | "bsr" | "realAcos" | "sessionsDay"
  | "unitSoldSessionPct" | "shippingCosts";

export interface ViewConfig {
  primaryMetric: MetricId;
  sortBy: MetricId;
  sortDir: "desc" | "asc";
  visibleCols: MetricId[];
  viewMode: "marketplace" | "groupByProduct";
  groupByProduct: boolean;
}

export const DEFAULT_CONFIG: ViewConfig = {
  primaryMetric: "sales",
  sortBy: "sales",
  sortDir: "desc",
  visibleCols: [
    "sales", "orders", "units",
    "refunds", "percentRefunds", "refundCost",
    "promo", "adSpend", "amazonFees", "costOfGoods",
    "grossProfit", "netProfit", "estimatedPayout", "expenses",
    "margin", "roi", "realAcos",
  ],
  viewMode: "marketplace",
  groupByProduct: false,
};

export interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  canPrimary: boolean;
}

export const METRIC_DEFS: MetricDef[] = [
  { id: "revenue",  label: "Fatturato",  short: "Fatt.",  canPrimary: true  },
  { id: "sales",    label: "Vendite",    short: "Vend.",  canPrimary: true  },
  { id: "orders",   label: "Ordini",     short: "Ord.",   canPrimary: true  },
  { id: "units",    label: "Unità",      short: "Un.",    canPrimary: true  },
  { id: "refunds",  label: "Resi",       short: "Resi",   canPrimary: false },
  { id: "promo",    label: "Promo",      short: "Promo",  canPrimary: false },
  { id: "adSpend",  label: "Ad Spend",   short: "Ads",    canPrimary: false },
  { id: "percentRefunds", label: "% Resi", short: "% Resi", canPrimary: false },
  { id: "sellableReturns", label: "Resi Vendibili", short: "RV", canPrimary: false },
  { id: "refundCost", label: "Costo Resi", short: "CR", canPrimary: false },
  { id: "amazonFees", label: "Commissioni", short: "Com.", canPrimary: false },
  { id: "costOfGoods", label: "Costo Merce", short: "CM", canPrimary: false },
  { id: "grossProfit", label: "Utile Lordo", short: "UL", canPrimary: false },
  { id: "netProfit", label: "Utile Netto", short: "UN", canPrimary: false },
  { id: "estimatedPayout", label: "Payout Stim.", short: "Pay", canPrimary: false },
  { id: "expenses", label: "Spese", short: "Spese", canPrimary: false },
  { id: "margin", label: "Margine", short: "Marg.", canPrimary: false },
  { id: "roi", label: "ROI", short: "ROI", canPrimary: false },
  { id: "bsr", label: "BSR", short: "BSR", canPrimary: false },
  { id: "realAcos", label: "Real ACOS", short: "ACOS", canPrimary: false },
  { id: "sessionsDay", label: "Sessioni/gg", short: "Sess", canPrimary: false },
  { id: "unitSoldSessionPct", label: "Unit/Session %", short: "U/S%", canPrimary: false },
  { id: "shippingCosts", label: "Costi Spedizione", short: "Ship", canPrimary: false },
];

export const COL_W: Record<MetricId, string> = {
  revenue: "8.5rem",
  sales: "8.5rem",
  orders: "6rem",
  units: "6rem",
  refunds: "6rem",
  promo: "6rem",
  adSpend: "6.5rem",
  percentRefunds: "6rem",
  sellableReturns: "6rem",
  refundCost: "6.5rem",
  amazonFees: "6.5rem",
  costOfGoods: "6.5rem",
  grossProfit: "6.5rem",
  netProfit: "6.5rem",
  estimatedPayout: "7rem",
  expenses: "6rem",
  margin: "6rem",
  roi: "6rem",
  bsr: "5rem",
  realAcos: "6rem",
  sessionsDay: "6rem",
  unitSoldSessionPct: "6rem",
  shippingCosts: "6rem",
};

export interface ChannelRow {
  source: "shopify" | "amazon";
  channelKey: string;
  label: string;
  color: string;
  revenue: number;
  orders: number;
  units: number;
  adSpend: number;
}

export interface ProductRow {
  id: string;
  source: "shopify" | "amazon";
  sku: string | null;
  asin: string | null;
  ean?: string | null;
  productTitle: string;
  imageUrl: string | null;
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  adSpend: number;
  marginPct: number | null;
  grossProfit: number | null;
  hasCogs: boolean;
  estFees: number;
  channels: ChannelRow[];
  refunds?: number;
  promo?: number;
  percentRefunds?: number;
  sellableReturns?: number;
  refundCost?: number;
  amazonFees?: number;
  costOfGoods?: number;
  netProfit?: number;
  estimatedPayout?: number;
  expenses?: number;
  margin?: number;
  roi?: number;
  bsr?: number;
  realAcos?: number;
  sessionsDay?: number;
  unitSoldSessionPct?: number;
  shippingCosts?: number;
  totalRefunds?: number;
}

export interface ChannelGroup {
  channelKey: string;
  label: string;
  color: string;
  flag: string;
  source: "amazon" | "shopify" | "temu" | "redcare";
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  products: ProductRow[];
}

export type ActiveSection = "all" | "amazon" | "shopify" | "temu" | "redcare";

export interface CrossChannelProductsProps {
  filter: string;
  from: string;
  to: string;
  marketplace: string;
}

export const AMAZON_ORANGE = "#fbbf24";
export const ALL_AMAZON_MPS = ["IT", "DE", "FR", "ES"] as const;

export const CHANNEL_FLAGS: Record<string, string> = {
  AMAZON_IT: "🇮🇹", AMAZON_DE: "🇩🇪", AMAZON_FR: "🇫🇷", AMAZON_ES: "🇪🇸",
  IT: "🇮🇹", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸",
  REDCARE_IT: "🇮🇹", REDCARE_DE: "🇩🇪",
  TEMU_IT: "🇮🇹", TEMU_ES: "🇪🇸", TEMU_FR: "🇫🇷", TEMU_DE: "🇩🇪",
  EBAY: "🛒", TIKTOK: "🎵", BENU_FARMA: "💊", UNCLASSIFIED: "📦",
};

export const LS_KEY = "ccp_channel_view_v1";
