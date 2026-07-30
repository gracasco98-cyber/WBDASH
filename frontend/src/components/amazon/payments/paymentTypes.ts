// Shared types for the Amazon Payments page and its sub-components.
// No React imports — pure TypeScript. Safe to import from hook and components alike.

export const COUNTRY_FLAGS: Record<string, string> = {
  IT: "🇮🇹",
  DE: "🇩🇪",
  ES: "🇪🇸",
  FR: "🇫🇷",
  NL: "🇳🇱",
  PL: "🇵🇱",
  UK: "🇬🇧",
  GB: "🇬🇧",
  SE: "🇸🇪",
  BE: "🇧🇪",
  IE: "🇮🇪",
  US: "🇺🇸",
  TR: "🇹🇷",
};

export const COUNTRY_NAMES: Record<string, string> = {
  IT: "Italia",       DE: "Germania",    ES: "Spagna",      FR: "Francia",
  NL: "Paesi Bassi", PL: "Polonia",     UK: "Regno Unito", GB: "Regno Unito",
  SE: "Svezia",      BE: "Belgio",      IE: "Irlanda",     US: "Stati Uniti",
  TR: "Turchia",
};

export const COST_LABELS: Record<string, string> = {
  principal:  "Vendite lorde",
  commission: "Commissioni Amazon",
  fbaFees:    "Fee FBA / Logistica",
  ppcCost:    "Advertising (PPC)",
  otherFees:  "Altre fee",
  refunds:    "Rimborsi / Resi",
};

export const MARKET_ORDER = ["IT", "DE", "FR", "ES", "NL", "PL", "SE", "BE", "IE", "UK", "GB", "US", "TR"];
export const PERIOD_OPTIONS  = ["YTD", "QTD", "MTD", "Q1", "Q2", "Q3", "Q4", "Periodo personalizzato"];
export const COMPARE_OPTIONS = ["Non confrontare", "Periodo precedente", "Anno precedente"];

// ── getCountryDisplay ──────────────────────────────────────────────────────────
export function getCountryDisplay(code: string): { flag: string; label: string; fullLabel: string } {
  if (code === "Europa") return { flag: "🌍", label: "Europa", fullLabel: "🌍 Europa" };
  const flag  = COUNTRY_FLAGS[code] ?? "";
  const label = COUNTRY_NAMES[code] ?? code;
  return { flag, label, fullLabel: flag ? `${flag} ${label}` : label };
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Settlement {
  settlementId:   string;
  marketplace:    string;
  dateFrom:       string;
  dateTo:         string;
  depositDate:    string | null;
  netPayout:      number;
  computedNet:    number;
  missingAmount:  number;
  hasDataWarning: boolean;
  orderCount:     number;
  principal:      number;
  commission:     number;
  fbaFees:        number;
  ppcCost:        number;
  otherFees:      number;
  refunds:        number;
}

export interface CostBreakdown {
  principal:  number;
  commission: number;
  fbaFees:    number;
  ppcCost:    number;
  otherFees:  number;
  refunds:    number;
  net:        number;
}

export interface CostDriver {
  key:   string;
  label: string;
  cur:   number;
  cmp:   number | null;
  diff:  number | null;
  pct:   number | null;
}

export interface CountryDriver {
  code: string; flag: string; name: string;
  cur: number; cmp: number | null; diff: number | null; pct: number | null;
}

export interface ProductLine {
  asin:         string;
  title:        string;
  curRevenue:   number;
  cmpRevenue:   number;
  deltaRevenue: number;
  curUnits:     number;
  cmpUnits:     number;
}

export interface ProductSection {
  available: boolean;
  lines:     ProductLine[];
  message?:  string;
}

export interface OrdersSection {
  cur:   number;
  cmp:   number;
  delta: number;
}

export interface SalesSection {
  curGross:   number;
  cmpGross:   number;
  curRefunds: number;
  cmpRefunds: number;
  curNet:     number;
  cmpNet:     number;
}

export interface CostsSection {
  curFees:  number;
  cmpFees:  number;
  delta:    number;
}

export interface IntelligenceResult {
  bullets:          string[];
  summaryLine:      string;
  products:         ProductSection;
  orders:           OrdersSection;
  sales:            SalesSection;
  costs:            CostsSection;
  alerts:           string[];
  dataQuality:      { score: number; issues: string[] };
  baselineInsights?: string[];
  anomalyAlerts?:   string[];
}

export interface CalendarEntry {
  date: string; status: "received" | "next" | "estimated";
  markets: string[]; total: number | null;
}

export interface PaymentItem {
  id: string; status: string; date: string; amount: number | null;
  countries: string[]; daysLabel?: string; note?: string;
  validatorStatus?: "reconciled" | "partial" | "error" | "unknown";
}

export interface CountryData {
  country: string; code: string; flag: string;
  amount: number; comparisonAmount: number; percentage: number;
}

export interface AnalyticsResult {
  current:    { total: number; bars: { date: string; amount: number }[]; breakdown: CountryData[] };
  comparison: { total: number; bars: { date: string; amount: number }[]; breakdown: CountryData[]; label: string } | null;
  variationPct:      number | null;
  hasComparisonData: boolean;
}
