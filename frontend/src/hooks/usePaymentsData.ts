"use client";
// Custom hook that owns all data-fetching, state, and derived-computation
// logic for the Amazon Payments page.
// Components consume the result as pure props — no internal fetching.

import { useState, useEffect, useCallback, useMemo } from "react";
import { api, AmazonPaymentForecast } from "@/lib/api";
import {
  Settlement, AnalyticsResult, IntelligenceResult, PaymentItem, CountryData,
  COUNTRY_NAMES, COUNTRY_FLAGS,
} from "@/components/amazon/payments/paymentTypes";
import {
  getPeriodDates, getComparisonPeriod, getPaymentAnalytics,
  paymentIntelligenceAgent, generateMockPriorYearSettlements,
  getValidatorStatus, buildCalendarEntries,
} from "@/components/amazon/payments/paymentUtils";

// ── Result shape ───────────────────────────────────────────────────────────────

export interface PaymentsPageData {
  settlements:            Settlement[];
  allSettlements:         Settlement[];
  forecastData:           AmazonPaymentForecast | null;
  paymentItems:           PaymentItem[];
  analytics:              AnalyticsResult;
  intelligence:           IntelligenceResult & { baselineInsights: string[]; anomalyAlerts: string[] };
  availableCountryOptions: string[];
  forecastCountries:      CountryData[];
  currentRange:           { from: Date; to: Date };
  compRange:              { from: Date; to: Date; label: string } | null;
  daysUntilNext:          number | null;
}

export interface UsePaymentsDataResult {
  data:    PaymentsPageData | null;
  loading: boolean;
  error:   string | null;
  refresh: () => Promise<void>;
  // Filter state — owned by this hook so all derived state stays consistent
  period:          string;
  setPeriod:       (v: string) => void;
  compareMode:     string;
  setCompareMode:  (v: string) => void;
  selectedCountry: string;
  setSelectedCountry: (v: string) => void;
  customFrom:      string;
  setCustomFrom:   (v: string) => void;
  customTo:        string;
  setCustomTo:     (v: string) => void;
  selectedPayId:   string | null;
  setSelectedPayId: (id: string | null) => void;
}

const MARKET_ORDER = ["IT", "DE", "FR", "ES", "NL", "PL", "SE", "BE", "IE", "UK", "GB", "US", "TR"];

export function usePaymentsData(): UsePaymentsDataResult {
  // ── API state ──────────────────────────────────────────────────────────────
  const [paymentsData, setPaymentsData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<AmazonPaymentForecast | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [period,          setPeriod]          = useState("YTD");
  const [compareMode,     setCompareMode]     = useState("Non confrontare");
  const [selectedCountry, setSelectedCountry] = useState("Europa");
  const [customFrom,      setCustomFrom]      = useState("");
  const [customTo,        setCustomTo]        = useState("");
  const [selectedPayId,   setSelectedPayId]   = useState<string | null>(null);

  // ── Parallel async: order counts + product rows ────────────────────────────
  const [curOrderCount,  setCurOrderCount]  = useState<number>(0);
  const [cmpOrderCount,  setCmpOrderCount]  = useState<number>(0);
  const [curProductRows, setCurProductRows] = useState<any[]>([]);
  const [cmpProductRows, setCmpProductRows] = useState<any[]>([]);

  // ── Initial / manual load ──────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    await Promise.allSettled([
      api.amazon.payments()
        .then(d => setPaymentsData(d))
        .catch(() => setError("Impossibile caricare i pagamenti Amazon.")),
      api.amazon.forecast()
        .then(d => setForecastData(d))
        .catch(e => console.error(e)),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Parallel fetch of orders + products when filters change ───────────────
  useEffect(() => {
    if (loading) return;
    const { from: cf, to: ct } = getPeriodDates(period, customFrom, customTo);
    const compR = compareMode !== "Non confrontare"
      ? getComparisonPeriod(period, compareMode, cf, ct)
      : null;
    const iso = (d: Date) => d.toISOString().split("T")[0];
    const mp  = selectedCountry === "Europa" ? undefined : selectedCountry;

    const curOrderParams: Record<string, string> = { filter: "custom", from: iso(cf), to: iso(ct), limit: "1" };
    if (mp) curOrderParams.marketplace = mp;
    const cmpOrderParams: Record<string, string> = { filter: "custom", from: iso(compR?.from ?? cf), to: iso(compR?.to ?? ct), limit: "1" };
    if (mp) cmpOrderParams.marketplace = mp;
    const curProdParams: Record<string, string> = { filter: "custom", from: iso(cf), to: iso(ct) };
    if (mp) curProdParams.marketplace = mp;
    const cmpProdParams: Record<string, string> = { filter: "custom", from: iso(compR?.from ?? cf), to: iso(compR?.to ?? ct) };
    if (mp) cmpProdParams.marketplace = mp;

    Promise.all([
      api.amazon.orders(curOrderParams),
      compR ? api.amazon.orders(cmpOrderParams) : Promise.resolve(null),
      api.amazon.products(curProdParams),
      compR ? api.amazon.products(cmpProdParams) : Promise.resolve(null),
    ])
      .then(([curO, cmpO, curP, cmpP]) => {
        setCurOrderCount((curO as any)?.total ?? 0);
        setCmpOrderCount((cmpO as any)?.total ?? 0);
        setCurProductRows((curP as any)?.products ?? []);
        setCmpProductRows((cmpP as any)?.products ?? []);
      })
      .catch(err => console.error("parallel fetch error:", err));
  }, [loading, period, compareMode, selectedCountry, customFrom, customTo]);

  // ── Derived: real settlements ──────────────────────────────────────────────
  const settlements = useMemo((): Settlement[] =>
    ((paymentsData?.settlements ?? []) as any[])
      .filter((s: any) => s.marketplace && s.marketplace !== "EU" && s.marketplace !== "?")
      .map((s: any): Settlement => ({
        settlementId:   s.settlementId,
        marketplace:    String(s.marketplace),
        dateFrom:       String(s.dateFrom ?? s.dateTo ?? ""),
        dateTo:         String(s.dateTo ?? ""),
        depositDate:    s.depositDate ?? null,
        netPayout:      Number(s.netPayout)     || 0,
        computedNet:    Number(s.computedNet)   || 0,
        missingAmount:  Number(s.missingAmount) || 0,
        hasDataWarning: Boolean(s.hasDataWarning),
        orderCount:     Number(s.orderCount)    || 0,
        principal:      Number(s.principal)     || 0,
        commission:     Number(s.commission)    || 0,
        fbaFees:        Number(s.fbaFees)       || 0,
        ppcCost:        Number(s.ppcCost)       || 0,
        otherFees:      Number(s.otherFees)     || 0,
        refunds:        Number(s.refunds)       || 0,
      })),
  [paymentsData]);

  // ── Derived: all settlements (real + synthetic prior-year) ─────────────────
  const allSettlements = useMemo(
    () => [...settlements, ...generateMockPriorYearSettlements(settlements)],
    [settlements],
  );

  // ── Derived: validator badges ──────────────────────────────────────────────
  const validatorByDate = useMemo(() => {
    const m = new Map<string, "reconciled" | "partial" | "error" | "unknown">();
    const rank = (v: ReturnType<typeof getValidatorStatus>) =>
      v === "error" ? 3 : v === "partial" ? 2 : v === "reconciled" ? 1 : 0;
    for (const s of settlements) {
      const cur  = getValidatorStatus(s);
      const prev = m.get(s.dateTo);
      if (!prev || rank(cur) > rank(prev)) m.set(s.dateTo, cur);
    }
    return m;
  }, [settlements]);

  // ── Derived: calendar + payment items ─────────────────────────────────────
  const { paymentItems } = useMemo(
    () => buildCalendarEntries(settlements, forecastData, validatorByDate),
    [settlements, forecastData, validatorByDate],
  );

  // Auto-select most recent received payment
  useEffect(() => {
    if (paymentItems.length > 0 && !selectedPayId) {
      const rec = paymentItems.filter(p => p.status === "Ricevuto");
      if (rec.length > 0) setSelectedPayId(rec[rec.length - 1].id);
    }
  }, [paymentItems, selectedPayId]);

  // ── Derived: period ranges ─────────────────────────────────────────────────
  const currentRange = useMemo(() => getPeriodDates(period, customFrom, customTo), [period, customFrom, customTo]);
  const compRange    = useMemo(
    () => getComparisonPeriod(period, compareMode, currentRange.from, currentRange.to),
    [period, compareMode, currentRange],
  );

  // ── Derived: analytics ────────────────────────────────────────────────────
  const analytics = useMemo((): AnalyticsResult =>
    getPaymentAnalytics(
      allSettlements, selectedCountry, currentRange,
      compareMode !== "Non confrontare" ? compRange : null,
    ),
    [allSettlements, selectedCountry, currentRange, compRange, compareMode],
  );

  // ── Derived: intelligence engine ──────────────────────────────────────────
  const intelligence = useMemo(() =>
    paymentIntelligenceAgent(
      settlements, allSettlements,
      selectedCountry, analytics, forecastData,
      currentRange, compareMode !== "Non confrontare" ? compRange : null,
      compareMode !== "Non confrontare",
      curOrderCount, cmpOrderCount, curProductRows, cmpProductRows,
    ),
    [settlements, allSettlements, selectedCountry, analytics, forecastData,
     currentRange, compRange, compareMode, curOrderCount, cmpOrderCount,
     curProductRows, cmpProductRows],
  );

  // ── Derived: country filter options ───────────────────────────────────────
  const availableCountryOptions = useMemo((): string[] => {
    const codes = new Set(settlements.map(s => s.marketplace));
    return ["Europa", ...Array.from(codes).sort((a, b) => {
      const ia = MARKET_ORDER.indexOf(a); const ib = MARKET_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    })];
  }, [settlements]);

  // ── Derived: forecast countries for the "Prossimo pagamento" card ─────────
  const forecastCountries = useMemo((): CountryData[] => {
    if (!forecastData) return [];
    const total = forecastData.totals?.totalProjectedNet ?? 0;
    return (forecastData.byMarketplace ?? [])
      .filter(mp => (mp.projectedNet ?? 0) > 0)
      .map(mp => ({
        country:          COUNTRY_NAMES[mp.marketplace] ?? mp.marketplace,
        code:             mp.marketplace,
        flag:             COUNTRY_FLAGS[mp.marketplace] ?? "?",
        amount:           mp.projectedNet ?? 0,
        comparisonAmount: 0,
        percentage:       total > 0 ? Math.round(((mp.projectedNet ?? 0) / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [forecastData]);

  // ── Derived: days until next payment ──────────────────────────────────────
  const daysUntilNext = useMemo(() => {
    const cycle    = forecastData?.cycle ?? null;
    const todayStr = new Date().toISOString().split("T")[0];
    return cycle?.nextPeriodEnd
      ? Math.round(
          (new Date(cycle.nextPeriodEnd + "T00:00:00").getTime() -
           new Date(todayStr + "T00:00:00").getTime()) / 86400000,
        )
      : null;
  }, [forecastData]);

  // ── Assemble result ────────────────────────────────────────────────────────
  const data: PaymentsPageData | null = paymentsData
    ? {
        settlements,
        allSettlements,
        forecastData,
        paymentItems,
        analytics,
        intelligence,
        availableCountryOptions,
        forecastCountries,
        currentRange,
        compRange,
        daysUntilNext,
      }
    : null;

  return {
    data, loading, error, refresh,
    period, setPeriod,
    compareMode, setCompareMode,
    selectedCountry, setSelectedCountry,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    selectedPayId, setSelectedPayId,
  };
}
