// Pure utility functions for Amazon Payments — no React, no hooks, no side effects.
// Import freely from hook and components.

import {
  Settlement, CostBreakdown, CostDriver, CountryData, AnalyticsResult,
  ProductLine, ProductSection, OrdersSection, SalesSection, CostsSection,
  IntelligenceResult, CalendarEntry, PaymentItem,
  COUNTRY_FLAGS, COUNTRY_NAMES, COST_LABELS, MARKET_ORDER,
} from "./paymentTypes";
import type { AmazonPaymentForecast } from "@/lib/api";

// ── Formatting ─────────────────────────────────────────────────────────────────

export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export function formatCurrencyIT(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercentageIT(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}%`;
}

export function formatDeltaIT(delta: number): string {
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${formatCurrencyIT(Math.abs(delta))}`;
}

export function isComparisonSignificant(cmpValue: number): boolean {
  return cmpValue >= 1_000;
}

export function fmtDay(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtShort(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function formatCountryCode(code: string): string {
  if (code === "Europa") return "🌍 Europa";
  const flag  = COUNTRY_FLAGS[code] ?? "";
  const label = COUNTRY_NAMES[code] ?? code;
  return flag ? `${flag} ${label}` : label;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export function getPeriodDates(period: string, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  switch (period) {
    case "YTD":  return { from: new Date(y, 0, 1),                      to: now };
    case "MTD":  return { from: new Date(y, m, 1),                      to: now };
    case "QTD":  return { from: new Date(y, Math.floor(m / 3) * 3, 1), to: now };
    case "Q1":   return { from: new Date(y, 0, 1),  to: new Date(y, 2,  31, 23, 59, 59) };
    case "Q2":   return { from: new Date(y, 3, 1),  to: new Date(y, 5,  30, 23, 59, 59) };
    case "Q3":   return { from: new Date(y, 6, 1),  to: new Date(y, 8,  30, 23, 59, 59) };
    case "Q4":   return { from: new Date(y, 9, 1),  to: new Date(y, 11, 31, 23, 59, 59) };
    case "Periodo personalizzato":
      if (customFrom && customTo)
        return { from: new Date(customFrom + "T00:00:00"), to: new Date(customTo + "T23:59:59") };
      return { from: new Date(y, 0, 1), to: now };
    default: return { from: new Date(y, 0, 1), to: now };
  }
}

function buildPeriodLabel(period: string, year: number, month: number): string {
  switch (period) {
    case "YTD":  return `YTD ${year}`;
    case "MTD":  return new Date(year, month, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    case "QTD":  return `QTD ${year}`;
    case "Q1":   return `Q1 ${year}`;
    case "Q2":   return `Q2 ${year}`;
    case "Q3":   return `Q3 ${year}`;
    case "Q4":   return `Q4 ${year}`;
    default:     return `${year}`;
  }
}

export function getPeriodLabel(period: string, customFrom?: string, customTo?: string): string {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  if (period === "Periodo personalizzato") {
    if (customFrom && customTo) {
      const f = new Date(customFrom + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      const t = new Date(customTo   + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
      return `${f} → ${t}`;
    }
    return "Periodo personalizzato";
  }
  return buildPeriodLabel(period, y, m);
}

export function getComparisonPeriod(
  period: string,
  mode: string,
  currentFrom: Date,
  currentTo: Date,
): { from: Date; to: Date; label: string } | null {
  if (mode === "Non confrontare") return null;

  const now  = new Date();
  const y    = now.getFullYear();
  const m    = now.getMonth();
  const sfmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const lfmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

  if (mode === "Anno precedente") {
    const f = new Date(currentFrom); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(currentTo);   t.setFullYear(t.getFullYear() - 1);
    const label = buildPeriodLabel(period, y - 1, m);
    return { from: f, to: t, label };
  }

  switch (period) {
    case "YTD": {
      const rangeMs = currentTo.getTime() - currentFrom.getTime();
      const t = new Date(y - 1, 11, 31, 23, 59, 59);
      const f = new Date(t.getTime() - rangeMs);
      return { from: f, to: t, label: `YTD ${y - 1}` };
    }
    case "MTD": {
      const dayOfMonth = now.getDate();
      const f = new Date(y, m - 1, 1);
      const t = new Date(y, m - 1, dayOfMonth, 23, 59, 59);
      return {
        from: f, to: t,
        label: f.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
      };
    }
    case "QTD": {
      const currQ   = Math.floor(m / 3);
      const elapsed = Math.round((currentTo.getTime() - currentFrom.getTime()) / 86400000);
      let pqYear = y; let pqMon = (currQ - 1) * 3;
      if (pqMon < 0) { pqMon = 9; pqYear = y - 1; }
      const f = new Date(pqYear, pqMon, 1);
      const t = new Date(f.getTime() + elapsed * 86400000);
      return { from: f, to: t, label: `Q${Math.floor(pqMon / 3) + 1} ${pqYear}` };
    }
    case "Q1": return { from: new Date(y - 1, 9, 1),  to: new Date(y - 1, 11, 31, 23, 59, 59), label: `Q4 ${y - 1}` };
    case "Q2": return { from: new Date(y, 0, 1),       to: new Date(y,  2, 31, 23, 59, 59),     label: `Q1 ${y}` };
    case "Q3": return { from: new Date(y, 3, 1),       to: new Date(y,  5, 30, 23, 59, 59),     label: `Q2 ${y}` };
    case "Q4": return { from: new Date(y, 6, 1),       to: new Date(y,  8, 30, 23, 59, 59),     label: `Q3 ${y}` };
    case "Periodo personalizzato": {
      const rangeMs = currentTo.getTime() - currentFrom.getTime();
      const t = new Date(currentFrom.getTime() - 1);
      const f = new Date(t.getTime() - rangeMs);
      return { from: f, to: t, label: `${sfmt(f)} → ${lfmt(t)}` };
    }
    default: return null;
  }
}

export function filterByPeriod(settlements: Settlement[], country: string, from: Date, to: Date): Settlement[] {
  return settlements.filter(s => {
    const refDate = s.dateFrom || s.dateTo;
    if (!refDate) return false;
    if (country !== "Europa" && s.marketplace !== country) return false;
    const d = new Date(refDate + "T12:00:00");
    return d >= from && d <= to;
  });
}

// ── Analytics ──────────────────────────────────────────────────────────────────

export function getPaymentAnalytics(
  settlements:  Settlement[],
  country:      string,
  currentRange: { from: Date; to: Date },
  compRange:    { from: Date; to: Date; label: string } | null,
): AnalyticsResult {
  const groupByDate = (setts: Settlement[]) => {
    const map = new Map<string, number>();
    for (const s of setts) map.set(s.dateTo, (map.get(s.dateTo) ?? 0) + s.netPayout);
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
  };

  const groupByMarketplace = (setts: Settlement[]) => {
    const map = new Map<string, number>();
    for (const s of setts) map.set(s.marketplace, (map.get(s.marketplace) ?? 0) + s.netPayout);
    return map;
  };

  const buildBreakdown = (mpMap: Map<string, number>, cmpMap?: Map<string, number>): CountryData[] => {
    const total   = Array.from(mpMap.values()).reduce((a, b) => a + b, 0);
    const allKeys = new Set([...mpMap.keys(), ...(cmpMap ? cmpMap.keys() : [])]);
    return Array.from(allKeys)
      .map(code => ({
        country:          COUNTRY_NAMES[code] ?? code,
        code,
        flag:             COUNTRY_FLAGS[code] ?? "?",
        amount:           mpMap.get(code)  ?? 0,
        comparisonAmount: cmpMap?.get(code) ?? 0,
        percentage:       total > 0 ? Math.round(((mpMap.get(code) ?? 0) / total) * 100) : 0,
      }))
      .filter(c => c.amount > 0 || c.comparisonAmount > 0)
      .sort((a, b) => b.amount - a.amount);
  };

  const curSetts = filterByPeriod(settlements, country, currentRange.from, currentRange.to);
  const curBars  = groupByDate(curSetts);
  const curTotal = curBars.reduce((s, b) => s + b.amount, 0);
  const curMpMap = groupByMarketplace(curSetts);

  if (!compRange) {
    return {
      current:           { total: curTotal, bars: curBars, breakdown: buildBreakdown(curMpMap) },
      comparison:        null,
      variationPct:      null,
      hasComparisonData: false,
    };
  }

  const cmpSetts = filterByPeriod(settlements, country, compRange.from, compRange.to);
  const cmpBars  = groupByDate(cmpSetts);
  const cmpTotal = cmpBars.reduce((s, b) => s + b.amount, 0);
  const cmpMpMap = groupByMarketplace(cmpSetts);

  return {
    current:    { total: curTotal, bars: curBars, breakdown: buildBreakdown(curMpMap, cmpMpMap) },
    comparison: { total: cmpTotal, bars: cmpBars, breakdown: buildBreakdown(cmpMpMap), label: compRange.label },
    variationPct:      cmpTotal > 0 ? ((curTotal - cmpTotal) / cmpTotal) * 100 : null,
    hasComparisonData: cmpBars.length > 0,
  };
}

// ── Cost aggregation ───────────────────────────────────────────────────────────

export function aggregateCosts(setts: Settlement[]): CostBreakdown {
  return setts.reduce<CostBreakdown>((acc, s) => ({
    principal:  acc.principal  + s.principal,
    commission: acc.commission + s.commission,
    fbaFees:    acc.fbaFees    + s.fbaFees,
    ppcCost:    acc.ppcCost    + s.ppcCost,
    otherFees:  acc.otherFees  + s.otherFees,
    refunds:    acc.refunds    + s.refunds,
    net:        acc.net        + s.netPayout,
  }), { principal: 0, commission: 0, fbaFees: 0, ppcCost: 0, otherFees: 0, refunds: 0, net: 0 });
}

// ── buildProductSection ───────────────────────────────────────────────────────

export function buildProductSection(curRows: any[], cmpRows: any[]): ProductSection {
  if (!curRows.length) {
    return { available: false, lines: [], message: "Nessun prodotto nel periodo selezionato." };
  }
  const cmpMap = new Map<string, any>(cmpRows.map((p: any) => [p.asin, p]));
  const lines: ProductLine[] = curRows
    .map((p: any) => {
      const cmp = cmpMap.get(p.asin);
      return {
        asin:         String(p.asin ?? ""),
        title:        String(p.productTitle ?? p.asin ?? "").slice(0, 40),
        curRevenue:   Number(p.grossRevenue) || 0,
        cmpRevenue:   Number(cmp?.grossRevenue) || 0,
        deltaRevenue: (Number(p.grossRevenue) || 0) - (Number(cmp?.grossRevenue) || 0),
        curUnits:     Number(p.unitsSold) || 0,
        cmpUnits:     Number(cmp?.unitsSold) || 0,
      };
    })
    .sort((a, b) => Math.abs(b.deltaRevenue) - Math.abs(a.deltaRevenue))
    .slice(0, 3);
  return { available: true, lines };
}

// ── Agent functions ────────────────────────────────────────────────────────────

export function reconciliationAgent(settlements: Settlement[]): { status: "good" | "partial" | "issues"; messages: string[] } {
  const messages: string[] = [];
  let worstStatus: "good" | "partial" | "issues" = "good";
  for (const s of settlements) {
    if (!s.netPayout) continue;
    const absPct = Math.abs(s.missingAmount / s.netPayout);
    if (absPct > 0.05)  { worstStatus = "issues";  messages.push(`Settlement ${s.settlementId.slice(-8)}: scarto ${(absPct * 100).toFixed(1)}%`); }
    else if (absPct > 0.005 && worstStatus !== "issues") { worstStatus = "partial"; }
  }
  return { status: worstStatus, messages };
}

function comparisonAgent(curSetts: Settlement[], cmpSetts: Settlement[]) {
  const curCosts = aggregateCosts(curSetts);
  const cmpCosts = aggregateCosts(cmpSetts);
  const netDiff  = curCosts.net - cmpCosts.net;
  const netPct   = cmpCosts.net > 0 ? (netDiff / cmpCosts.net) * 100 : null;
  return { curCosts, cmpCosts, netDiff, netPct };
}

function driverAnalysisAgent(
  curSetts:  Settlement[],
  cmpSetts:  Settlement[],
  analytics: AnalyticsResult,
) {
  const { curCosts, cmpCosts } = comparisonAgent(curSetts, cmpSetts);
  const curCount = analytics.current.bars.length;
  const cmpCount = analytics.comparison?.bars.length ?? 0;
  const curAvg   = curCount > 0 ? analytics.current.total / curCount   : 0;
  const cmpAvg   = cmpCount > 0 ? (analytics.comparison?.total ?? 0) / cmpCount : 0;

  const countContrib = cmpAvg * (curCount - cmpCount);
  const avgContrib   = curCount * (curAvg - cmpAvg);
  const mainIsCount  = Math.abs(countContrib) >= Math.abs(avgContrib);

  const costDrivers: CostDriver[] = (["principal", "commission", "fbaFees", "ppcCost", "otherFees", "refunds"] as const)
    .map(key => {
      const cur  = curCosts[key];
      const cmp  = cmpCosts[key];
      const diff = cur - cmp;
      const pct  = cmp !== 0 ? (diff / Math.abs(cmp)) * 100 : null;
      return { key, label: COST_LABELS[key], cur, cmp, diff, pct };
    })
    .sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));

  const countryDetails = analytics.current.breakdown.map(c => {
    const cmp  = c.comparisonAmount;
    const diff = c.amount - cmp;
    const pct  = cmp > 0 ? (diff / cmp) * 100 : null;
    return { code: c.code, flag: c.flag, name: c.country, cur: c.amount, cmp, diff, pct };
  }).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));

  return {
    mainIsCount, countContrib, avgContrib,
    curCount, cmpCount, curAvg, cmpAvg,
    costDrivers, countryDetails, curCosts, cmpCosts,
  };
}

function forecastAgent(forecast: AmazonPaymentForecast | null) {
  if (!forecast) return { nextNet: null, settlementDate: null, label: "non disponibile" };
  const nextNet        = forecast.totals?.totalProjectedNet ?? null;
  const settlementDate = forecast.cycle?.nextPeriodEnd ?? null;
  const daysUntil      = settlementDate
    ? Math.round((new Date(settlementDate + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
    : null;
  const label = daysUntil != null && daysUntil >= 0 ? `tra ${daysUntil} gg` : "stimato";
  return { nextNet, settlementDate, label };
}

function dataQualityAgent(settlements: Settlement[]): { quality: "good" | "partial" | "missing"; issues: string[] } {
  if (!settlements.length) return { quality: "missing", issues: ["Nessun settlement disponibile"] };
  const issues: string[] = [];
  const withWarning = settlements.filter(s => s.hasDataWarning);
  if (withWarning.length > 0)
    issues.push(`${withWarning.length} settlement con dati incompleti`);
  const noCosts = settlements.filter(s => s.principal === 0 && s.netPayout > 0);
  if (noCosts.length > 0)
    issues.push("Dettaglio costi non disponibile per alcuni settlement");
  return {
    quality: issues.length === 0 ? "good" : "partial",
    issues,
  };
}

function copyInsightAgent(params: {
  mode:         "comparison" | "standalone";
  products:     ProductSection;
  orders:       OrdersSection;
  sales:        SalesSection;
  costs:        CostsSection;
  compLabel:    string;
  variationPct: number | null;
  showGuard:    boolean;
  topBreakdown: CountryData[];
  nextNet:      number | null;
}): { bullets: string[]; summaryLine: string } {
  const { mode, products, orders, sales, costs, compLabel, variationPct, showGuard, topBreakdown, nextNet } = params;
  const bullets: string[] = [];
  let summaryLine = "";

  if (mode === "comparison") {
    const absDiff = sales.curNet - sales.cmpNet;
    summaryLine = showGuard
      ? `${formatDeltaIT(absDiff)} vs ${compLabel}`
      : `${formatPercentageIT(variationPct ?? 0)} vs ${compLabel} (${formatDeltaIT(absDiff)})`;

    if (products.available && products.lines.length > 0) {
      const top = products.lines[0];
      const totalAbsDelta = Math.abs(sales.curNet - sales.cmpNet);
      if (totalAbsDelta > 0 && Math.abs(top.deltaRevenue) / totalAbsDelta > 0.4) {
        const unitDelta = top.curUnits - top.cmpUnits;
        bullets.push(
          `${top.title} (${top.asin}) ha contribuito ${formatDeltaIT(top.deltaRevenue)}, ${unitDelta >= 0 ? "+" : ""}${unitDelta} unità vendute.`
        );
      }
    }

    if (bullets.length < 3 && orders.delta > 0 && sales.curNet < sales.cmpNet && orders.cmp > 0 && orders.cur > 0) {
      const curAvg = sales.curGross / orders.cur;
      const cmpAvg = sales.cmpGross / orders.cmp;
      bullets.push(
        `Valore medio per ordine sceso da ${formatCurrencyIT(cmpAvg)} a ${formatCurrencyIT(curAvg)} (${formatDeltaIT(curAvg - cmpAvg)}).`
      );
    }

    if (bullets.length < 3) {
      const curRef = Math.abs(sales.curRefunds);
      const cmpRef = Math.abs(sales.cmpRefunds);
      if (cmpRef > 0 && curRef > cmpRef * 1.2) {
        bullets.push(
          `I rimborsi sono aumentati da ${formatCurrencyIT(cmpRef)} a ${formatCurrencyIT(curRef)} (${formatDeltaIT(curRef - cmpRef)}).`
        );
      }
    }

    if (bullets.length < 3 && sales.curNet > sales.cmpNet && costs.delta < 0) {
      bullets.push(
        `Netto migliorato di ${formatDeltaIT(sales.curNet - sales.cmpNet)} nonostante fee in aumento di ${formatDeltaIT(Math.abs(costs.delta))}.`
      );
    }

    if (bullets.length < 3 && products.available && products.lines.length > 0) {
      const top = products.lines[0];
      if (!bullets.some(b => b.includes(top.asin))) {
        bullets.push(
          `${top.title} (${top.asin}): ${formatCurrencyIT(top.curRevenue)} incassato, ${top.curUnits} unità.`
        );
      }
    }

    if (bullets.length < 3) {
      const dir = sales.curNet >= sales.cmpNet ? "superiore" : "inferiore";
      bullets.push(
        `Netto ${dir} al confronto: ${formatCurrencyIT(sales.curNet)} vs ${formatCurrencyIT(sales.cmpNet)}.`
      );
    }

    return { bullets: bullets.slice(0, 3), summaryLine };

  } else {
    const n = orders.cur;
    summaryLine = `${n} ${n === 1 ? "ordine" : "ordini"} nel periodo`;
    bullets.push(`${n} ${n === 1 ? "ordine ricevuto" : "ordini ricevuti"} nel periodo selezionato.`);
    if (n > 0 && sales.curGross > 0) {
      bullets.push(`Valore medio per ordine: ${formatCurrencyIT(sales.curGross / n)}.`);
    }
    if (nextNet && nextNet > 0) {
      bullets.push(`Prossimo pagamento stimato: ${formatCurrencyIT(nextNet)}.`);
    } else if (topBreakdown[0]) {
      bullets.push(`Mercato principale: ${topBreakdown[0].flag} ${topBreakdown[0].country} (${topBreakdown[0].percentage}%).`);
    }
    return { bullets: bullets.slice(0, 3), summaryLine };
  }
}

// ── Baseline ───────────────────────────────────────────────────────────────────

interface PaymentBaseline {
  avgCycleNet:      number;
  cycleCount:       number;
  byCountry:        Record<string, { avgCycle: number; share: number }>;
  byCost:           Partial<Record<keyof CostBreakdown, number>>;
  dateRange:        { first: string; last: string } | null;
}

function computeBaseline(realSettlements: Settlement[]): PaymentBaseline {
  if (!realSettlements.length) {
    return { avgCycleNet: 0, cycleCount: 0, byCountry: {}, byCost: {}, dateRange: null };
  }

  const byDate = new Map<string, Settlement[]>();
  for (const s of realSettlements) {
    const arr = byDate.get(s.dateTo) ?? [];
    arr.push(s);
    byDate.set(s.dateTo, arr);
  }

  const dates  = Array.from(byDate.keys()).sort();
  const cycles = dates.map(d => {
    const setts = byDate.get(d)!;
    return { date: d, net: setts.reduce((a, s) => a + s.netPayout, 0), setts };
  });

  const cycleCount  = cycles.length;
  const totalNet    = cycles.reduce((a, c) => a + c.net, 0);
  const avgCycleNet = cycleCount > 0 ? totalNet / cycleCount : 0;

  const countryMap = new Map<string, { total: number; count: number }>();
  const totalAllNet = totalNet;
  for (const cycle of cycles) {
    const countryInCycle = new Map<string, number>();
    for (const s of cycle.setts) {
      countryInCycle.set(s.marketplace, (countryInCycle.get(s.marketplace) ?? 0) + s.netPayout);
    }
    for (const [code, amt] of countryInCycle.entries()) {
      const prev = countryMap.get(code) ?? { total: 0, count: 0 };
      countryMap.set(code, { total: prev.total + amt, count: prev.count + 1 });
    }
  }
  const byCountry: Record<string, { avgCycle: number; share: number }> = {};
  for (const [code, { total, count }] of countryMap.entries()) {
    byCountry[code] = {
      avgCycle: count > 0 ? total / count : 0,
      share:    totalAllNet > 0 ? total / totalAllNet : 0,
    };
  }

  const totalCosts = aggregateCosts(realSettlements);
  const byCost: Partial<Record<keyof CostBreakdown, number>> = {};
  for (const key of ["principal", "commission", "fbaFees", "ppcCost", "otherFees", "refunds", "net"] as const) {
    byCost[key] = cycleCount > 0 ? totalCosts[key] / cycleCount : 0;
  }

  return {
    avgCycleNet,
    cycleCount,
    byCountry,
    byCost,
    dateRange: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null,
  };
}

// ── paymentIntelligenceAgent ────────────────────────────────────────────

export function paymentIntelligenceAgent(
  realSettlements:  Settlement[],
  allSettlements:   Settlement[],
  country:          string,
  analytics:        AnalyticsResult,
  forecast:         AmazonPaymentForecast | null,
  currentRange:     { from: Date; to: Date },
  compRange:        { from: Date; to: Date; label: string } | null,
  showComparison:   boolean,
  curOrderCount:    number,
  cmpOrderCount:    number,
  curProductRows:   any[],
  cmpProductRows:   any[],
): IntelligenceResult & { baselineInsights: string[]; anomalyAlerts: string[] } {

  const curSetts     = filterByPeriod(allSettlements, country, currentRange.from, currentRange.to);
  const cmpSetts     = compRange ? filterByPeriod(allSettlements, country, compRange.from, compRange.to) : [];
  const driverResult = driverAnalysisAgent(curSetts, cmpSetts, analytics);
  const fcastResult  = forecastAgent(forecast);
  const { curCosts, cmpCosts } = driverResult;

  const orders: OrdersSection = {
    cur:   curOrderCount,
    cmp:   cmpOrderCount,
    delta: curOrderCount - cmpOrderCount,
  };

  const sales: SalesSection = {
    curGross:   curCosts.principal,
    cmpGross:   cmpCosts.principal,
    curRefunds: curCosts.refunds,
    cmpRefunds: cmpCosts.refunds,
    curNet:     curCosts.net,
    cmpNet:     cmpCosts.net,
  };

  const curFees = curCosts.commission + curCosts.fbaFees + curCosts.ppcCost + curCosts.otherFees;
  const cmpFees = cmpCosts.commission + cmpCosts.fbaFees + cmpCosts.ppcCost + cmpCosts.otherFees;
  const costs: CostsSection = { curFees, cmpFees, delta: curFees - cmpFees };

  const products = buildProductSection(curProductRows, cmpProductRows);

  const cmpTotal = analytics.comparison?.total ?? 0;
  const { bullets, summaryLine } = copyInsightAgent({
    mode:         showComparison && analytics.hasComparisonData ? "comparison" : "standalone",
    products, orders, sales, costs,
    compLabel:    compRange?.label ?? "",
    variationPct: analytics.variationPct,
    showGuard:    !isComparisonSignificant(cmpTotal),
    topBreakdown: analytics.current.breakdown,
    nextNet:      fcastResult.nextNet,
  });

  const baseline         = computeBaseline(realSettlements.filter(s => !s.settlementId.startsWith("mock_")));
  const baselineInsights: string[] = [];
  const anomalyAlerts:    string[] = [];
  const curCount  = analytics.current.bars.length;
  const curTotal  = analytics.current.total;
  const curAvgNet = curCount > 0 ? curTotal / curCount : 0;

  if (baseline.avgCycleNet > 0 && curAvgNet > 0) {
    const vsBasePct = ((curAvgNet - baseline.avgCycleNet) / baseline.avgCycleNet) * 100;
    if (Math.abs(vsBasePct) >= 15) {
      const dir  = vsBasePct >= 0 ? "sopra" : "sotto";
      const sign = vsBasePct >= 0 ? "+" : "";
      baselineInsights.push(
        `Importo medio ciclo ${dir} la media storica (${sign}${vsBasePct.toFixed(1).replace(".", ",")}%, media: ${fmtEur(baseline.avgCycleNet)})`
      );
    }
  }

  for (const c of analytics.current.breakdown) {
    const hist = baseline.byCountry[c.code];
    if (!hist || hist.avgCycle === 0) continue;
    const curCountryAvg = curCount > 0 ? c.amount / curCount : 0;
    const vsBasePct = ((curCountryAvg - hist.avgCycle) / hist.avgCycle) * 100;
    if (Math.abs(vsBasePct) >= 40 && c.amount > 500) {
      const dir  = vsBasePct >= 0 ? "sopra" : "sotto";
      const sign = vsBasePct >= 0 ? "+" : "";
      anomalyAlerts.push(`${c.flag} ${c.country} ${dir} la sua media storica di ${sign}${vsBasePct.toFixed(0)}%`);
    }
  }

  const dqResult = dataQualityAgent(curSetts);
  if (dqResult.quality !== "good") anomalyAlerts.push(...dqResult.issues);

  const enrichedBullets = [...bullets];
  if (!showComparison && baselineInsights.length > 0 && enrichedBullets.length < 3) {
    enrichedBullets.push(baselineInsights[0]);
  }

  return {
    bullets:         enrichedBullets.slice(0, 3),
    summaryLine,
    products,
    orders,
    sales,
    costs,
    alerts:          [...anomalyAlerts],
    dataQuality:     {
      score:  dqResult.quality === "good" ? 100 : dqResult.quality === "partial" ? 70 : 0,
      issues: dqResult.issues,
    },
    baselineInsights,
    anomalyAlerts,
  };
}

// ── Mock data ──────────────────────────────────────────────────────────────────

function deterministicRatio(seed: string, min: number, max: number): number {
  let h = 5381;
  for (const ch of seed) h = ((h << 5) + h + ch.charCodeAt(0)) & 0x7fffffff;
  return min + (h % 10000) / 10000 * (max - min);
}

export function generateMockPriorYearSettlements(real: Settlement[]): Settlement[] {
  if (!real.length) return [];
  const existingYears = new Set(real.map(s => new Date((s.dateFrom || s.dateTo) + "T12:00:00").getFullYear()));
  const maxYear  = Math.max(...Array.from(existingYears));
  const priorYear = maxYear - 1;
  if (existingYears.has(priorYear)) return [];

  const shiftYear = (d: string) => {
    const dt = new Date(d + "T12:00:00"); dt.setFullYear(dt.getFullYear() - 1);
    return dt.toISOString().split("T")[0];
  };

  return real
    .filter(s => new Date((s.dateFrom || s.dateTo) + "T12:00:00").getFullYear() === maxYear)
    .map(s => {
      const f = deterministicRatio(s.settlementId, 0.68, 0.90);
      return {
        ...s,
        settlementId:   `mock_py_${s.settlementId}`,
        dateFrom:       shiftYear(s.dateFrom || s.dateTo),
        dateTo:         shiftYear(s.dateTo),
        depositDate:    s.depositDate ? shiftYear(s.depositDate) : null,
        netPayout:      Math.round(s.netPayout      * f * 100) / 100,
        computedNet:    Math.round(s.computedNet    * f * 100) / 100,
        missingAmount:  0,
        hasDataWarning: false,
        principal:      Math.round(s.principal      * f * 100) / 100,
        commission:     Math.round(s.commission     * f * 100) / 100,
        fbaFees:        Math.round(s.fbaFees        * f * 100) / 100,
        ppcCost:        Math.round(s.ppcCost        * f * 100) / 100,
        otherFees:      Math.round(s.otherFees      * f * 100) / 100,
        refunds:        Math.round(s.refunds        * f * 100) / 100,
        orderCount:     Math.round(s.orderCount     * f),
      };
    });
}

// ── Validator ──────────────────────────────────────────────────────────────────

export function getValidatorStatus(s: Settlement): "reconciled" | "partial" | "error" | "unknown" {
  if (!s.netPayout) return "unknown";
  const absPct = Math.abs(s.missingAmount / s.netPayout);
  if (absPct <= 0.005) return "reconciled";
  if (absPct <= 0.05)  return "partial";
  return "error";
}

// ── CSV export ─────────────────────────────────────────────────────────────────

export function downloadCsvFromSettlements(settlements: Settlement[], label: string) {
  const rows = [
    "Marketplace,Data Pagamento,Data Bonifico,Netto (EUR),Vendite Lorde,Commissioni,FBA,PPC,Altre Fee,Rimborsi,N. Ordini",
    ...settlements.map(s => [
      s.marketplace, s.dateTo, s.depositDate ?? "",
      s.netPayout.toFixed(2), s.principal.toFixed(2),
      s.commission.toFixed(2), s.fbaFees.toFixed(2),
      s.ppcCost.toFixed(2), s.otherFees.toFixed(2),
      s.refunds.toFixed(2), String(s.orderCount),
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `pagamenti-amazon-${label.replace(/[^a-zA-Z0-9]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Calendar entry / PaymentItem builders ──────────────────────────────────────

export function buildCalendarEntries(
  settlements: Settlement[],
  forecastData: AmazonPaymentForecast | null,
  validatorByDate: Map<string, "reconciled" | "partial" | "error" | "unknown">,
): { calendarEntries: CalendarEntry[]; paymentItems: PaymentItem[] } {
  if (!settlements.length && !forecastData) return { calendarEntries: [], paymentItems: [] };

  const grouped = new Map<string, { total: number; markets: Set<string> }>();
  for (const s of settlements) {
    if (!s.dateTo) continue;
    const prev = grouped.get(s.dateTo) ?? { total: 0, markets: new Set<string>() };
    prev.total += s.netPayout; prev.markets.add(s.marketplace);
    grouped.set(s.dateTo, prev);
  }

  const sortedMp = (set: Set<string>) =>
    Array.from(set).sort((a, b) => {
      const ia = MARKET_ORDER.indexOf(a); const ib = MARKET_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    });

  const received: CalendarEntry[] = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-3)
    .map(([date, g]) => ({ date, status: "received" as const, markets: sortedMp(g.markets), total: g.total }));

  const cycle    = forecastData?.cycle ?? null;
  const nextDate = cycle?.nextPeriodEnd ?? cycle?.nextDepositEst ?? null;
  const entries: CalendarEntry[] = [...received];
  if (nextDate) {
    const fcastMarkets = (forecastData?.byMarketplace ?? [])
      .filter(mp => (mp.projectedNet ?? 0) > 0)
      .map(mp => mp.marketplace)
      .sort((a, b) => {
        const ia = MARKET_ORDER.indexOf(a); const ib = MARKET_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1; if (ib === -1) return -1;
        return ia - ib;
      });
    entries.push({ date: nextDate, status: "next", markets: fcastMarkets, total: forecastData?.totals?.totalProjectedNet ?? null });
    for (const off of [14, 28]) {
      const d = new Date(nextDate + "T12:00:00"); d.setDate(d.getDate() + off);
      entries.push({ date: d.toISOString().split("T")[0], status: "estimated", markets: fcastMarkets, total: null });
    }
  }

  const nextIdx = entries.findIndex(e => e.status === "next");
  const paymentItems: PaymentItem[] = entries.map((entry, i) => ({
    id: entry.date,
    status: entry.status === "received" ? "Ricevuto" : entry.status === "next" ? "Prossimo" : "Stimato",
    date: entry.date, amount: entry.total, countries: entry.markets,
    daysLabel: entry.status === "estimated" && nextIdx >= 0 ? `+${(i - nextIdx) * 14} gg` : undefined,
    note: entry.status === "next" ? "Previsione netta stimata" : entry.status === "estimated" ? "Stima da calcolare" : undefined,
    validatorStatus: entry.status === "received" ? (validatorByDate.get(entry.date) ?? "unknown") : undefined,
  }));

  return { calendarEntries: entries, paymentItems };
}
