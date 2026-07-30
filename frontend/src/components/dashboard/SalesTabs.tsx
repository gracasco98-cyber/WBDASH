"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock, CalendarDays, TrendingUp, ChevronDown, Check } from "lucide-react";
import SalesChart from "./SalesChart";
import { api, TimePoint } from "@/lib/api";
import { formatEUR } from "@/lib/marketplaces";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMostRecentDate(weekday: number): string {
  const now = new Date();
  const todayWd = now.getDay(); // 0=Sun
  const diff = (todayWd - weekday + 7) % 7;
  const d = new Date(now);
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function mergeByTime(shopify: TimePoint[], amazon: TimePoint[]): TimePoint[] {
  if (!amazon.length) return shopify;
  const azMap = new Map(amazon.map(pt => [pt.time, pt.revenue]));
  const allTimes = new Set([...shopify.map(pt => pt.time), ...amazon.map(pt => pt.time)]);
  const sMap = new Map(shopify.map(pt => [pt.time, pt]));
  return [...allTimes].sort().map(time => ({
    time,
    revenue: (sMap.get(time)?.revenue ?? 0) + (azMap.get(time) ?? 0),
    count: sMap.get(time)?.count ?? 0,
  }));
}

function aggregateToHourly(pts: TimePoint[]): TimePoint[] {
  const groups: Record<string, { time: string; revenue: number; count: number }> = {};
  for (const pt of pts) {
    const hh  = pt.time.split(":")[0];
    const key = `${hh}:00`;
    if (!groups[key]) groups[key] = { time: key, revenue: 0, count: 0 };
    groups[key].revenue += pt.revenue;
    groups[key].count   += pt.count;
  }
  return Object.values(groups).sort((a, b) => a.time.localeCompare(b.time));
}

// Normalize Amazon hourly format "2026-04-21T14:00" → "14:00" to match Shopify's "HH:00"
function normalizeAmazonTimes(pts: TimePoint[]): TimePoint[] {
  return pts.map(pt => ({
    ...pt,
    time: pt.time.includes("T") ? pt.time.split("T")[1].slice(0, 5) : pt.time,
  }));
}

// ─── Day definitions ──────────────────────────────────────────────────────────

const DAYS = [
  { key: 1, label: "Lunedì",    short: "Lun", color: "#3b82f6"  },
  { key: 2, label: "Martedì",   short: "Mar", color: "#a78bfa"  },
  { key: 3, label: "Mercoledì", short: "Mer", color: "#10b981"  },
  { key: 4, label: "Giovedì",   short: "Gio", color: "#f59e0b"  },
  { key: 5, label: "Venerdì",   short: "Ven", color: "#f97316"  },
  { key: 6, label: "Sabato",    short: "Sab", color: "#ec4899"  },
  { key: 0, label: "Domenica",  short: "Dom", color: "#ef4444"  },
];

const findDay  = (key: number) => DAYS.find(d => d.key === key);

// ─── Marketplace definitions ──────────────────────────────────────────────────

const AMAZON_CODE: Record<string, string> = {
  AMAZON_IT: "IT", AMAZON_DE: "DE", AMAZON_FR: "FR",
  AMAZON_ES: "ES", AMAZON_PL: "PL", AMAZON_UK: "UK",
  AMAZON_US: "US", AMAZON_CA: "CA", AMAZON_MX: "MX",
};

interface MpItem { key: string; label: string; color: string }

const MP_GROUPS: { label: string; items: MpItem[] }[] = [
  { label: "Amazon EU", items: [
    { key: "AMAZON_IT", label: "Amazon.it",     color: "#f59e0b" },
    { key: "AMAZON_DE", label: "Amazon.de",     color: "#3b82f6" },
    { key: "AMAZON_FR", label: "Amazon.fr",     color: "#a78bfa" },
    { key: "AMAZON_ES", label: "Amazon.es",     color: "#ec4899" },
    { key: "AMAZON_PL", label: "Amazon.pl",     color: "#06b6d4" },
    { key: "AMAZON_UK", label: "Amazon.co.uk",  color: "#10b981" },
  ]},
  { label: "Amazon NA", items: [
    { key: "AMAZON_US", label: "Amazon.com",    color: "#f97316" },
    { key: "AMAZON_CA", label: "Amazon.ca",     color: "#ef4444" },
    { key: "AMAZON_MX", label: "Amazon.com.mx", color: "#22c55e" },
  ]},
  { label: "Shopify / Ext", items: [
    { key: "SHOPIFY_DIRECT", label: "Shopify Diretto", color: "#22c55e" },
    { key: "REDCARE_IT",     label: "Redcare IT",       color: "#ef4444" },
    { key: "REDCARE_DE",     label: "Redcare DE",       color: "#dc2626" },
    { key: "TEMU_IT",        label: "Temu IT",          color: "#f97316" },
    { key: "TEMU_ES",        label: "Temu ES",          color: "#fb923c" },
    { key: "TEMU_FR",        label: "Temu FR",          color: "#fbbf24" },
    { key: "TEMU_DE",        label: "Temu DE",          color: "#d97706" },
    { key: "EBAY",           label: "eBay",             color: "#60a5fa" },
    { key: "TIKTOK",         label: "TikTok",           color: "#c084fc" },
  ]},
];

const ALL_MP  = MP_GROUPS.flatMap(g => g.items);
const findMp  = (key: string): MpItem | undefined => ALL_MP.find(m => m.key === key);

// ─── Series type ──────────────────────────────────────────────────────────────

interface Series { id: string; label: string; color: string; data: TimePoint[] }

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function MultiTooltip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  const seriesMap: Record<string, Series> = Object.fromEntries((series ?? []).map((s: Series) => [s.id, s]));
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 shadow-xl text-xs space-y-1 min-w-[170px]">
      <div className="text-zinc-400 font-medium mb-1">{label}</div>
      {[...payload].reverse().map((p: any) => {
        const s = seriesMap[p.dataKey];
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s?.color ?? p.fill }} />
              <span className="text-zinc-300 text-[11px] truncate">{s?.label ?? p.dataKey}</span>
            </span>
            <span className="text-white font-semibold tabular-nums shrink-0">{formatEUR(p.value ?? 0)}</span>
          </div>
        );
      })}
      {payload.length > 1 && (
        <div className="border-t border-white/5 pt-1 flex justify-between text-zinc-500 text-[11px]">
          <span>Totale</span>
          <span className="text-zinc-300 font-semibold tabular-nums">{formatEUR(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Incidence badges ─────────────────────────────────────────────────────────

function IncidenceBar({ series }: { series: Series[] }) {
  const withTotals = series.map(s => ({
    ...s,
    total: s.data.reduce((acc, pt) => acc + pt.revenue, 0),
  })).sort((a, b) => b.total - a.total);
  const grand = withTotals.reduce((s, t) => s + t.total, 0);
  if (grand === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
      {withTotals.map(({ id, label, color, total }) => (
        <div key={id}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
        >
          <span>{label}</span>
          <span style={{ opacity: 0.75 }}>{formatEUR(total)}</span>
          <span className="font-bold">{grand > 0 ? ((total / grand) * 100).toFixed(1) : 0}%</span>
        </div>
      ))}
      <div className="flex items-center px-2 py-0.5 rounded-full text-[10px] text-zinc-500"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        Totale {formatEUR(grand)}
      </div>
    </div>
  );
}

// ─── Build the 7 days before today (yesterday → 7 days ago), chronological ────

function buildLast7Days() {
  const today = new Date();
  const result: Array<{ iso: string; short: string; dayNum: number; color: string; label: string }> = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wd = d.getDay();
    const dayDef = DAYS.find(day => day.key === wd)!;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    result.push({ iso, short: dayDef.short, dayNum: d.getDate(), color: dayDef.color, label: dayDef.label });
  }
  return result;
}

const LAST_7_DAYS = buildLast7Days();

// ─── Day picker ───────────────────────────────────────────────────────────────

function DayPicker({ selected, onChange }: { selected: string[]; onChange: (days: string[]) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {LAST_7_DAYS.map(({ iso, short, dayNum, color, label }) => {
        const isSelected = selected.includes(iso);
        return (
          <button key={iso}
            onClick={() => onChange(isSelected ? selected.filter(d => d !== iso) : [...selected, iso])}
            className="flex flex-col items-center px-2 py-0.5 rounded-md text-[10px] font-medium transition-all leading-tight"
            style={{
              background: isSelected ? `${color}20` : "rgba(255,255,255,0.03)",
              border: `1px solid ${isSelected ? color : "rgba(255,255,255,0.07)"}`,
              color: isSelected ? color : "#52525b",
              minWidth: 30,
            }}
            title={`${label} ${iso}`}
          >
            <span>{short}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>{dayNum}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Marketplace multi-select ─────────────────────────────────────────────────

function CheckBox({ checked, color }: { checked: boolean; color: string }) {
  return (
    <span className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
      style={{ border: `1.5px solid ${checked ? color : "#52525b"}`, background: checked ? color : "transparent", transition: "all 0.1s" }}>
      {checked && <Check size={8} strokeWidth={3} style={{ color: "#000" }} />}
    </span>
  );
}

function MpSelect({ selected, onChange }: { selected: string[]; onChange: (s: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggle = (key: string) => {
    if (key === "__all__") { onChange([]); return; }
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };

  const label = selected.length === 0 ? "Marketplace" :
    selected.length === 1 ? (findMp(selected[0])?.label ?? selected[0]) :
    `${selected.length} marketplace`;

  return (
    <div ref={ref} className="relative z-20">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
        style={{
          background: open || selected.length > 0 ? "rgba(110,231,183,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${open || selected.length > 0 ? "rgba(110,231,183,0.3)" : "rgba(255,255,255,0.1)"}`,
          color: selected.length > 0 ? "#6ee7b7" : "#a1a1aa",
        }}>
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown size={10} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 rounded-xl shadow-2xl overflow-y-auto"
          style={{ minWidth: 210, maxHeight: 300, background: "#0d0d14", border: "1px solid rgba(255,255,255,0.12)", zIndex: 50 }}>
          <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 text-[11px] font-medium"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", color: selected.length === 0 ? "#6ee7b7" : "#71717a" }}
            onClick={() => toggle("__all__")}>
            <CheckBox checked={selected.length === 0} color="#6ee7b7" />
            Tutti i marketplace
          </div>
          {MP_GROUPS.map(group => (
            <div key={group.label}>
              <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest select-none"
                style={{ color: "#3f3f46", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const checked = selected.includes(item.key);
                return (
                  <div key={item.key}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 text-[11px]"
                    style={{ color: checked ? item.color : "#71717a" }}
                    onClick={() => toggle(item.key)}>
                    <CheckBox checked={checked} color={item.color} />
                    {item.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data:          TimePoint[];
  bucket:        "minute" | "hour";
  multiDay?:     boolean;
  amazonData?:   TimePoint[];
  onHourClick?:  (hour: string) => void;
  marketplace?:  string;
  isAmazonMp?:   boolean;
  amazonMpCode?: string | null;
  filter:        string;
  from?:         string;
  to?:           string;
  hideCard?:     boolean;
  hideTabBar?:   boolean;
  monthlyTab?:   boolean;
}

type Tab = "giornaliero" | "mensile";

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesTabs({
  data, bucket, multiDay = false, amazonData, onHourClick,
  marketplace = "all", isAmazonMp = false, amazonMpCode = null,
  filter, from = "", to = "",
  hideCard = false, hideTabBar = false, monthlyTab = false,
}: Props) {
  const [tab, setTab] = useState<Tab>(monthlyTab ? "mensile" : "giornaliero");

  // ── Monthly state ──
  const [monthData,       setMonthData]       = useState<TimePoint[]>([]);
  const [monthAmazonData, setMonthAmazonData] = useState<TimePoint[]>([]);
  const [monthLoading,    setMonthLoading]    = useState(false);
  const [monthLoaded,     setMonthLoaded]     = useState(false);

  // ── Multi-series state ──
  const [selectedMps,  setSelectedMps]  = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]); // ISO dates of selected days
  const [seriesData,   setSeriesData]   = useState<Record<string, TimePoint[]>>({});
  const [seriesLoading, setSeriesLoading] = useState(false);

  // ── Load monthly ──
  const loadMonthly = useCallback(async () => {
    if (monthLoaded) return;
    setMonthLoading(true);
    try {
      const p: Record<string, string> = { filter: "month", bucket: "hour" };
      if (!isAmazonMp && marketplace !== "all") p.marketplace = marketplace;
      const azP: Record<string, string> = { filter: "month" };
      if (isAmazonMp && amazonMpCode) azP.marketplace = amazonMpCode;
      const [ts, azTs] = await Promise.all([
        api.timeseries(p),
        marketplace === "all" ? api.amazon.timeseries(azP).catch(() => []) : Promise.resolve([]),
      ]);
      setMonthData(ts);
      setMonthAmazonData(Array.isArray(azTs) ? azTs : []);
      setMonthLoaded(true);
    } catch { /* silent */ } finally { setMonthLoading(false); }
  }, [monthLoaded, marketplace, isAmazonMp, amazonMpCode]);

  useEffect(() => { setMonthLoaded(false); setMonthData([]); setMonthAmazonData([]); }, [marketplace]);
  useEffect(() => { if (tab === "mensile") loadMonthly(); }, [tab, loadMonthly]);
  useEffect(() => { setSelectedMps([]); setSelectedDays([]); setSeriesData({}); }, [marketplace]);

  // ── Fetch series data when selection changes ──
  useEffect(() => {
    const hasDays = selectedDays.length > 0;
    const hasMps  = selectedMps.length > 0;

    if (!hasDays && !hasMps) { setSeriesData({}); return; }

    setSeriesLoading(true);
    const tasks: Promise<[string, TimePoint[]]>[] = [];

    if (hasDays && !hasMps) {
      // Each selectedDay is an ISO date string — fetch Shopify hourly for that day
      selectedDays.forEach(isoDate => {
        const key = `day_${isoDate}`;
        tasks.push(
          api.timeseries({ filter: "custom", from: isoDate, to: isoDate, bucket: "hour" })
            .then(d => [key, d] as [string, TimePoint[]])
            .catch(() => [key, []] as [string, TimePoint[]])
        );
      });
    } else if (!hasDays && hasMps) {
      // One series per marketplace — over the current filter period
      selectedMps.forEach(mpKey => {
        const p: Record<string, string> = { filter, bucket: "hour" };
        if (from) p.from = from;
        if (to)   p.to   = to;
        if (mpKey in AMAZON_CODE) {
          tasks.push(
            api.amazon.timeseries({ ...p, marketplace: AMAZON_CODE[mpKey], granularity: "hour" })
              .then(normalizeAmazonTimes).catch(() => []).then(d => [`mp_${mpKey}`, d])
          );
        } else {
          tasks.push(
            api.timeseries({ ...p, marketplace: mpKey })
              .catch(() => []).then(d => [`mp_${mpKey}`, d])
          );
        }
      });
    } else {
      // One series per (day × marketplace) — selectedDays are ISO date strings
      selectedDays.forEach(isoDate => {
        selectedMps.forEach(mpKey => {
          const key = `d${isoDate}_${mpKey}`;
          const p: Record<string, string> = { filter: "custom", from: isoDate, to: isoDate, bucket: "hour" };
          if (mpKey in AMAZON_CODE) {
            tasks.push(
              api.amazon.timeseries({ ...p, marketplace: AMAZON_CODE[mpKey], granularity: "hour" })
                .then(normalizeAmazonTimes).catch(() => []).then(d => [key, d] as [string, TimePoint[]])
            );
          } else {
            tasks.push(
              api.timeseries({ ...p, marketplace: mpKey })
                .catch(() => []).then(d => [key, d] as [string, TimePoint[]])
            );
          }
        });
      });
    }

    if (tasks.length === 0) {
      // No extra fetches needed (only today selected, which uses the data prop)
      setSeriesData({});
      setSeriesLoading(false);
    } else {
      Promise.all(tasks).then(results => {
        setSeriesData(Object.fromEntries(results));
        setSeriesLoading(false);
      }).catch(() => setSeriesLoading(false));
    }
  }, [selectedDays, selectedMps, filter, from, to]);

  // ── Build series objects ──
  const allSeries = useMemo((): Series[] => {
    const hasDays = selectedDays.length > 0;
    const hasMps  = selectedMps.length > 0;
    if (!hasDays && !hasMps) return [];

    if (hasDays && !hasMps) {
      const todayIso = getTodayIso();
      // Today baseline: use the already-loaded data prop (aggregated to hourly)
      const todaySeries: Series = {
        id:    "day_today",
        label: `Oggi ${fmtDateShort(todayIso)}`,
        color: "#6ee7b7",
        data:  aggregateToHourly(data),
      };
      // Selected days (ISO dates) — all excluded today, so no filter needed
      const otherSeries = selectedDays.map(isoDate => {
        const d = new Date(isoDate + "T12:00:00"); // noon avoids DST edge cases
        const wd = d.getDay();
        const dayDef = DAYS.find(day => day.key === wd) ?? DAYS[0];
        return {
          id:    `day_${isoDate}`,
          label: `${dayDef.short} ${fmtDateShort(isoDate)}`,
          color: dayDef.color,
          data:  seriesData[`day_${isoDate}`] ?? [],
        };
      });
      return [todaySeries, ...otherSeries];
    }
    if (!hasDays && hasMps) {
      return selectedMps.map(mpKey => {
        const mp = findMp(mpKey)!;
        return { id: `mp_${mpKey}`, label: mp.label, color: mp.color, data: seriesData[`mp_${mpKey}`] ?? [] };
      });
    }
    // Both days × marketplaces — selectedDays are ISO date strings
    return selectedDays.flatMap(isoDate => {
      const d = new Date(isoDate + "T12:00:00");
      const wd = d.getDay();
      const dayDef = DAYS.find(day => day.key === wd) ?? DAYS[0];
      return selectedMps.map(mpKey => {
        const mp = findMp(mpKey)!;
        return {
          id:    `d${isoDate}_${mpKey}`,
          label: `${dayDef.short} ${fmtDateShort(isoDate)} · ${mp.label}`,
          color: mp.color,
          data:  seriesData[`d${isoDate}_${mpKey}`] ?? [],
        };
      });
    });
  }, [selectedDays, selectedMps, seriesData, data]);

  // ── Merge series into chart-ready data (X axis = time) ──
  const chartData = useMemo(() => {
    if (!allSeries.length) return [];
    const rawTimes = new Set(allSeries.flatMap(s => s.data.map(pt => pt.time)));
    // If data is hourly (HH:00 format), always pad to full 24h so all curves share the same axis
    const isHourly = [...rawTimes].every(t => /^\d{2}:\d{2}$/.test(t));
    if (isHourly) {
      for (let h = 0; h < 24; h++) rawTimes.add(`${String(h).padStart(2, "0")}:00`);
    }
    const allTimes = [...rawTimes].sort();
    return allTimes.map(time => {
      const row: Record<string, string | number> = { time };
      allSeries.forEach(s => {
        row[s.id] = s.data.find(pt => pt.time === time)?.revenue ?? 0;
      });
      return row;
    });
  }, [allSeries]);

  const formatTime = (t: string) => {
    if (t.includes("-") && t.split("-").length === 3) {
      const [y, m, d] = t.split("-");
      return new Date(Date.UTC(+y, +m - 1, +d))
        .toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    }
    return t;
  };

  const allLoaded    = allSeries.every(s => s.data.length > 0 || seriesData[s.id] !== undefined);
  const showChart    = !seriesLoading && allSeries.length > 0 && chartData.length > 0;
  const showNoData   = !seriesLoading && allSeries.length > 0 && allLoaded && chartData.length === 0;
  const showDefault  = !seriesLoading && allSeries.length === 0;

  const cardClasses = hideCard
    ? "h-full flex flex-col overflow-hidden"
    : "rounded-xl border border-bg-border bg-bg-card h-full min-h-[340px] flex flex-col overflow-hidden";

  return (
    <div className={cardClasses}>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      {!hideTabBar && (
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-bg-border)" }}>
          {([
            { key: "giornaliero" as const, label: "Andamento Giornaliero", icon: <Clock size={13} /> },
            { key: "mensile"     as const, label: "Andamento Mensile",     icon: <CalendarDays size={13} /> },
          ]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-2 px-5 py-3 text-xs font-semibold transition-all"
              style={{
                color: tab === key ? "#6ee7b7" : "#71717a",
                borderBottom: tab === key ? "2px solid #6ee7b7" : "2px solid transparent",
                background: tab === key ? "rgba(110,231,183,0.06)" : "transparent",
              }}>
              {icon}{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Giornaliero ───────────────────────────────────────────────────── */}
      {tab === "giornaliero" && (
        <div className="flex-1 flex flex-col px-4 pt-3 pb-4 min-h-0">

          {/* Controls: marketplace select + day picker */}
          <div className="flex items-start justify-between gap-3 mb-2 shrink-0 flex-wrap">
            <p className="text-[11px] text-zinc-500 self-center">
              {allSeries.length === 0
                ? "Shopify + Amazon · ora locale Italia"
                : selectedDays.length > 0 && selectedMps.length === 0
                  ? "Oggi vs giorni selezionati · totale · per fascia oraria"
                  : selectedDays.length === 0 && selectedMps.length > 0
                    ? "Fatturato per marketplace selezionati"
                    : "Confronto giorno × marketplace"}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <MpSelect selected={selectedMps} onChange={setSelectedMps} />
              <DayPicker selected={selectedDays} onChange={setSelectedDays} />
            </div>
          </div>

          {/* Incidence */}
          {allSeries.length > 0 && !seriesLoading && (
            <IncidenceBar series={allSeries} />
          )}

          {/* Loading */}
          {seriesLoading && (
            <div className="flex items-center justify-center flex-1 gap-2 text-sm text-zinc-600">
              <TrendingUp size={16} className="animate-pulse" />
              Caricamento dati…
            </div>
          )}

          {/* No data */}
          {showNoData && (
            <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm">
              Nessun dato per la selezione corrente
            </div>
          )}

          {/* Multi-series linear chart */}
          {showChart && (
            <div className="flex-1 min-h-[220px]">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    {allSeries.map(s => (
                      <linearGradient key={s.id} id={`g_${s.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={s.color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="time"
                    tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={formatTime}
                  />
                  <YAxis tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `€${(v / 1000).toFixed(1)}k`}
                    width={52}
                  />
                  <Tooltip
                    content={<MultiTooltip series={allSeries} />}
                    cursor={{ stroke: "#2a2a3e", strokeWidth: 1 }}
                  />
                  {allSeries.map(s => (
                    <Area key={s.id} type="monotone" dataKey={s.id}
                      stroke={s.color} strokeWidth={2}
                      fill={`url(#g_${s.id})`}
                      dot={false}
                      activeDot={{ r: 4, fill: s.color, stroke: "#0a0a0f", strokeWidth: 2 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Default chart */}
          {showDefault && (
            <SalesChart data={data} bucket={bucket} multiDay={multiDay}
              amazonData={amazonData} onHourClick={onHourClick} hideCard />
          )}

        </div>
      )}

      {/* ── Mensile ───────────────────────────────────────────────────────── */}
      {tab === "mensile" && (
        <div className="flex-1 flex flex-col px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <p className="text-[11px] text-zinc-500">Mese corrente · giornaliero · Shopify + Amazon</p>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span style={{ display:"inline-block", width:12, height:2, borderRadius:1, background:"#6ee7b7", opacity:0.8 }} />
                Shopify
              </span>
              <span className="flex items-center gap-1">
                <span style={{ display:"inline-block", width:12, height:2, borderRadius:1, background:"#fbbf24", opacity:0.8 }} />
                Amazon
              </span>
            </div>
          </div>
          {monthLoading ? (
            <div className="flex items-center justify-center flex-1 gap-2 text-sm text-zinc-600">
              <TrendingUp size={16} className="animate-pulse" />
              Caricamento dati mensili…
            </div>
          ) : (
            <SalesChart data={monthData} bucket="hour" multiDay={true}
              amazonData={monthAmazonData.length > 0 ? monthAmazonData : undefined} hideCard />
          )}
        </div>
      )}
    </div>
  );
}
