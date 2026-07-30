"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { X, ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { fmtEur } from "@/lib/fmt";
import CountryBreakdownRow from "./CountryBreakdownRow";
import { PeriodKey, getPeriodDates } from "./PaymentPeriodSelect";

/** Subset of settlement fields returned by /api/amazon/payments */
export interface Settlement {
  settlementId: string;
  marketplace:  string;
  depositDate:  string | null;
  netPayout:    number;
  principal:    number;
  commission:   number;
  fbaFees:      number;
  ppcCost:      number;
  otherFees:    number;
  refunds:      number;
}

// ── Types ────────────────────────────────────────────────────────────────────

type CountryKey  = "EU" | "IT" | "DE" | "ES" | "FR";
type CompareMode = "none" | "prev" | "yoy";

// ── Constants ─────────────────────────────────────────────────────────────────

const y = new Date().getFullYear();

const COUNTRY_OPTIONS: { key: CountryKey; label: string }[] = [
  { key: "EU", label: "Europa" },
  { key: "IT", label: "Italia" },
  { key: "DE", label: "Germania" },
  { key: "ES", label: "Spagna" },
  { key: "FR", label: "Francia" },
];

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "YTD",    label: "YTD" },
  { key: "QTD",    label: "QTD" },
  { key: "MTD",    label: "MTD" },
  { key: "Q1",     label: "Q1" },
  { key: "Q2",     label: "Q2" },
  { key: "Q3",     label: "Q3" },
  { key: "Q4",     label: "Q4" },
  { key: "CUSTOM", label: "Periodo personalizzato" },
];

const COMPARE_OPTIONS: { key: CompareMode; label: string }[] = [
  { key: "none", label: "Non confrontare" },
  { key: "prev", label: "Periodo precedente" },
  { key: "yoy",  label: "Anno scorso" },
];

// ── Comparison period helper ──────────────────────────────────────────────────

function getComparisonRange(
  period: PeriodKey,
  mode:   CompareMode,
): { from: Date; to: Date; label: string } | null {
  if (mode === "none") return null;

  const now = new Date();
  const cy  = now.getFullYear();
  const cm  = now.getMonth();

  if (mode === "yoy") {
    // Same period offset back 1 year
    const { from, to, label } = getPeriodDates(period);
    const f = new Date(from); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to);   t.setFullYear(t.getFullYear() - 1);
    return { from: f, to: t, label: `${label} (${cy - 1})` };
  }

  // mode === "prev": immediately preceding equivalent period
  switch (period) {
    case "ANNO":
      return {
        from:  new Date(cy - 1, 0, 1),
        to:    new Date(cy - 1, 11, 31, 23, 59, 59),
        label: `Anno ${cy - 1}`,
      };
    case "YTD": {
      const f = new Date(cy - 1, 0, 1);
      const t = new Date(now); t.setFullYear(cy - 1);
      return { from: f, to: t, label: `YTD ${cy - 1}` };
    }
    case "MTD": {
      const dom  = now.getDate();
      const f    = new Date(cy, cm - 1, 1);
      const t    = new Date(cy, cm - 1, dom, 23, 59, 59);
      const lbl  = f.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
      return { from: f, to: t, label: lbl };
    }
    case "QTD": {
      const currQ     = Math.floor(cm / 3);
      const { from: cf, to: ct } = getPeriodDates("QTD");
      const elapsed   = Math.round((ct.getTime() - cf.getTime()) / 86400000);
      const prevQMon  = (currQ - 1) * 3;
      const pYear     = prevQMon < 0 ? cy - 1 : cy;
      const pMon      = prevQMon < 0 ? 9 : prevQMon; // wrap to Q4 of prev year
      const f         = new Date(pYear, pMon, 1);
      const t         = new Date(f.getTime() + elapsed * 86400000);
      const qNum      = Math.floor(pMon / 3) + 1;
      return { from: f, to: t, label: `Q${qNum} ${pYear}` };
    }
    // Quarters → preceding quarter
    case "Q1": return { from: new Date(cy - 1, 9, 1),  to: new Date(cy - 1, 11, 31, 23, 59, 59), label: `Q4 ${cy - 1}` };
    case "Q2": return { from: new Date(cy, 0, 1),      to: new Date(cy, 2,  31, 23, 59, 59),      label: `Q1 ${cy}` };
    case "Q3": return { from: new Date(cy, 3, 1),      to: new Date(cy, 5,  30, 23, 59, 59),      label: `Q2 ${cy}` };
    case "Q4": return { from: new Date(cy, 6, 1),      to: new Date(cy, 8,  30, 23, 59, 59),      label: `Q3 ${cy}` };
    default:   return null;
  }
}

// ── Dropdown button ───────────────────────────────────────────────────────────

interface DropdownProps {
  label:    string;
  options:  { key: string; label: string }[];
  value:    string;
  onChange: (v: string) => void;
}

function FilterDropdown({ label, options, value, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.key === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-bg-card border border-bg-border text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all"
      >
        <span className="text-gray-400 text-[10px] uppercase tracking-wide hidden sm:inline">{label}</span>
        <span className="font-semibold">{current?.label ?? value}</span>
        <ChevronDown size={11} className={`text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 min-w-[150px] rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-hidden py-1">
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                opt.key === value
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  settlements:       Settlement[];
  nextPeriodEnd:     string | null;
  loading:           boolean;
  pinnedDepositDate?: string | null;
  onClearPin?:        () => void;
}

export default function ActualBlock({
  settlements, nextPeriodEnd, loading,
  pinnedDepositDate, onClearPin,
}: Props) {
  const [country,    setCountry]    = useState<CountryKey>("EU");
  const [period,     setPeriod]     = useState<PeriodKey>("YTD");
  const [compare,    setCompare]    = useState<CompareMode>("none");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo,   setCustomTo]   = useState<string>("");

  // ── Country filter ─────────────────────────────────────────────────────────
  const countryFiltered = useMemo(
    () => country === "EU" ? settlements : settlements.filter(s => s.marketplace === country),
    [settlements, country],
  );

  // ── Current period filter ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (pinnedDepositDate) return countryFiltered.filter(s => s.depositDate === pinnedDepositDate);
    if (period === "CUSTOM") {
      if (!customFrom || !customTo) return [];
      const from = new Date(customFrom + "T00:00:00");
      const to   = new Date(customTo   + "T23:59:59");
      return countryFiltered.filter(s => {
        if (!s.depositDate) return false;
        const d = new Date(s.depositDate + "T12:00:00");
        return d >= from && d <= to;
      });
    }
    const { from, to } = getPeriodDates(period);
    return countryFiltered.filter(s => {
      if (!s.depositDate) return false;
      const d = new Date(s.depositDate + "T12:00:00");
      return d >= from && d <= to;
    });
  }, [countryFiltered, pinnedDepositDate, period, customFrom, customTo]);

  // ── Comparison period filter ───────────────────────────────────────────────
  const compRange = useMemo(
    () => pinnedDepositDate ? null : getComparisonRange(period, compare),
    [period, compare, pinnedDepositDate],
  );

  const compFiltered = useMemo(() => {
    if (!compRange) return [];
    return countryFiltered.filter(s => {
      if (!s.depositDate) return false;
      const d = new Date(s.depositDate + "T12:00:00");
      return d >= compRange.from && d <= compRange.to;
    });
  }, [countryFiltered, compRange]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const currentNet = useMemo(
    () => filtered.reduce((s, r) => s + r.netPayout, 0),
    [filtered],
  );
  const compNet = useMemo(
    () => compFiltered.reduce((s, r) => s + r.netPayout, 0),
    [compFiltered],
  );

  const delta = compRange && compNet !== 0
    ? currentNet - compNet
    : null;
  const deltaPct = delta !== null && compNet !== 0
    ? (delta / Math.abs(compNet)) * 100
    : null;

  // ── Country breakdown ──────────────────────────────────────────────────────
  const breakdown = useMemo(() => {
    const byMarket = new Map<string, number>();
    for (const s of filtered) byMarket.set(s.marketplace, (byMarket.get(s.marketplace) ?? 0) + s.netPayout);
    const total = Array.from(byMarket.values()).reduce((a, b) => a + b, 0);
    return Array.from(byMarket.entries())
      .filter(([, v]) => v > 0)
      .map(([marketplace, amount]) => ({ marketplace, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const s of filtered) {
      if (!s.depositDate) continue;
      byDate.set(s.depositDate, (byDate.get(s.depositDate) ?? 0) + s.netPayout);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date:  new Date(date + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
        value,
      }));
  }, [filtered]);

  // ── Labels ─────────────────────────────────────────────────────────────────
  const periodLabel = pinnedDepositDate
    ? `Incassato il ${new Date(pinnedDepositDate + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`
    : period === "CUSTOM" && customFrom && customTo
    ? `${new Date(customFrom + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })} → ${new Date(customTo + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`
    : period === "CUSTOM"
    ? "Periodo personalizzato"
    : getPeriodDates(period).label;

  const daysUntilPayment = nextPeriodEnd
    ? Math.round(
        (new Date(nextPeriodEnd + "T00:00:00").getTime() -
         new Date(new Date().toISOString().split("T")[0] + "T00:00:00").getTime()) / 86400000,
      )
    : null;

  return (
    <section className="bg-bg-card border border-bg-border rounded-2xl overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-bg-border px-5 py-4 space-y-3">

        {/* Row 1: title + dropdowns (or pinned badge) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-semibold text-gray-800 text-sm">Incassato</span>
          </div>

          {!pinnedDepositDate ? (
            <div className="flex items-center gap-2">
              <FilterDropdown
                label="Paese"
                value={country}
                options={COUNTRY_OPTIONS}
                onChange={v => setCountry(v as CountryKey)}
              />
              <FilterDropdown
                label="Periodo"
                value={period}
                options={PERIOD_OPTIONS}
                onChange={v => { setPeriod(v as PeriodKey); setCompare("none"); }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
                {new Date(pinnedDepositDate + "T12:00:00").toLocaleDateString("it-IT", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </span>
              {onClearPin && (
                <button onClick={onClearPin} className="p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Deseleziona">
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2: comparison selector (hidden when pinned) */}
        {!pinnedDepositDate && (
          <div className="flex items-center gap-1 flex-wrap">
            {COMPARE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setCompare(opt.key)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-all ${
                  compare === opt.key
                    ? opt.key === "none"
                      ? "bg-gray-100 text-gray-700 border-gray-300 font-medium"
                      : "bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                    : "text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-200"
                }`}
              >
                {compare === opt.key && opt.key !== "none" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                )}
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: custom date range inputs — shown only when CUSTOM period is selected */}
        {!pinnedDepositDate && period === "CUSTOM" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Da</span>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-bg-border rounded-lg px-2.5 py-1 text-gray-700 bg-white focus:outline-none focus:border-emerald-400 transition-colors"
            />
            <span className="text-xs text-gray-400">a</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-bg-border rounded-lg px-2.5 py-1 text-gray-700 bg-white focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-5">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Next payment date */}
            {nextPeriodEnd && !pinnedDepositDate && (
              <p className="text-xs text-gray-400">
                Prossimo pagamento:{" "}
                <span className="text-gray-600 font-medium">
                  {new Date(nextPeriodEnd + "T12:00:00").toLocaleDateString("it-IT", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
                {daysUntilPayment != null && daysUntilPayment > 0 && (
                  <span className="text-gray-400 ml-1">· tra {daysUntilPayment} gg</span>
                )}
                {daysUntilPayment != null && daysUntilPayment <= 0 && (
                  <span className="text-emerald-600 font-medium ml-1">· oggi</span>
                )}
              </p>
            )}

            {/* Period label + main amount */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{periodLabel}</p>
              <p className="text-4xl font-bold text-gray-900 tabular-nums">
                {fmtEur(currentNet)}
              </p>
              <p className="text-xs text-gray-400 mt-1">netto liquidato (bank transfer)</p>

              {/* Comparison delta — shown when mode is active */}
              {compRange && delta !== null && (
                <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  delta > 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : delta < 0
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {delta > 0
                    ? <TrendingUp size={13} />
                    : delta < 0
                    ? <TrendingDown size={13} />
                    : <Minus size={13} />
                  }
                  <span>
                    {delta >= 0 ? "+" : ""}{fmtEur(delta)}
                    {deltaPct !== null && (
                      <span className="ml-1 font-medium opacity-80">
                        ({delta >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  <span className="font-normal opacity-60 ml-0.5">vs {compRange.label}</span>
                </div>
              )}

              {/* No comparison data notice */}
              {compRange && compNet === 0 && (
                <p className="mt-2 text-xs text-gray-400 italic">
                  Nessun dato disponibile per {compRange.label}
                </p>
              )}
            </div>

            {/* Area chart — only when 2+ data points */}
            {chartData.length >= 2 && (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs">
                            <div className="text-gray-400 mb-1">{label}</div>
                            <div className="text-emerald-600 font-semibold">{fmtEur(payload[0]?.value ?? 0)}</div>
                          </div>
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2}
                      fill="url(#actualGradient)"
                      dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: "#10b981" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Country breakdown */}
            {breakdown.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Per Paese</p>
                {breakdown.map(r => (
                  <CountryBreakdownRow
                    key={r.marketplace}
                    marketplace={r.marketplace}
                    amount={r.amount}
                    pct={r.pct}
                    color="emerald"
                  />
                ))}
              </div>
            )}

            {currentNet === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Nessun pagamento nel periodo selezionato
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
