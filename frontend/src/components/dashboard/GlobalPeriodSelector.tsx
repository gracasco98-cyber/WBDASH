"use client";
import { useState, useRef, useEffect } from "react";
import {
  Calendar,
  ChevronDown,
  Check,
  Clock3,
  X,
  GripHorizontal,
} from "lucide-react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import {
  getPeriodLabel,
  getDateRangeForPreset,
  formatDateToIso,
  getTodayIso,
} from "@/lib/periodUtils";
import { CompareMode, PeriodPreset } from "@/context/PeriodContext";

interface PeriodOption {
  value: PeriodPreset;
  label: string;
}

interface CompareOption {
  value: CompareMode;
  label: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "Ultimi 7 giorni" },
  { value: "last14", label: "Ultimi 14 giorni" },
  { value: "last30", label: "Ultimi 30 giorni" },
  { value: "month_to_date", label: "Mese in corso" },
  { value: "last_month", label: "Mese scorso" },
  { value: "custom", label: "Range personalizzato" },
];

const COMPARE_OPTIONS: CompareOption[] = [
  { value: "none", label: "Non confrontare" },
  { value: "previous_period", label: "Confronta con periodo precedente" },
  {
    value: "same_period_last_year",
    label: "Confronta con stesso periodo anno scorso",
  },
];

export default function GlobalPeriodSelector() {
  const { state, setPreset, setDateRange, setCompareMode } = usePeriodFilter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mobilePreset, setMobilePreset] = useState<PeriodPreset>(state.preset);
  const [mobileSelection, setMobileSelection] = useState<string>(state.preset);
  const [mobileCompare, setMobileCompare] = useState<CompareMode>(
    state.compareMode,
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Initialize custom date inputs when switching to custom mode
  useEffect(() => {
    if (state.preset === "custom" && state.from && state.to) {
      setCustomFrom(state.from);
      setCustomTo(state.to);
    }
  }, [state.preset, state.from, state.to]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApplyCustomRange = () => {
    if (customFrom && customTo) {
      setDateRange(customFrom, customTo);
      setIsOpen(false);
    }
  };

  const openMobileSheet = () => {
    setMobilePreset(state.preset);
    setMobileSelection(state.preset);
    setMobileCompare(state.compareMode);
    setIsMobileOpen(true);
  };
  const applyMobileSheet = () => {
    const selected = mobileOptions.find(
      (option) => option.key === mobileSelection,
    );
    const preset = selected?.value ?? mobilePreset;
    if (preset === "custom" && customFrom && customTo)
      setDateRange(customFrom, customTo);
    else setPreset(preset);
    setCompareMode(mobileCompare);
    setIsMobileOpen(false);
  };

  const mobileOptions = [
    {
      key: "set1",
      title: "Set 1",
      description:
        "Today · Yesterday · Month to date · This month · Last month",
      value: "today" as PeriodPreset,
    },
    {
      key: "set2",
      title: "Set 2",
      description: "Today · Yesterday · Month to date · Last month",
      value: "month_to_date" as PeriodPreset,
    },
    {
      key: "set3",
      title: "Set 3",
      description: "Today · Yesterday · 7 days · 14 days · 30 days",
      value: "last7" as PeriodPreset,
    },
    {
      key: "set4",
      title: "Set 4",
      description: "This week · Last week · 2 weeks ago · 3 weeks ago",
      value: "last14" as PeriodPreset,
    },
    {
      key: "set5",
      title: "Set 5",
      description: "Month to date · Last month · 2 months ago · 3 months ago",
      value: "last_month" as PeriodPreset,
    },
    {
      key: "set6",
      title: "Set 6",
      description: "Today · Yesterday · 2 days ago · 3 days ago",
      value: "yesterday" as PeriodPreset,
    },
    {
      key: "set7",
      title: "Set 7",
      description: "Today · Yesterday · 7 days ago · 8 days ago",
      value: "last30" as PeriodPreset,
    },
    {
      key: "set8",
      title: "Set 8",
      description:
        "This quarter · Last quarter · 2 quarters ago · 3 quarters ago",
      value: "month_to_date" as PeriodPreset,
    },
  ];

  const currentLabel = getPeriodLabel(state.preset, state.from, state.to);
  const compareLabel =
    COMPARE_OPTIONS.find((c) => c.value === state.compareMode)?.label || "";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openMobileSheet}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-white transition-colors hover:bg-white/[0.02] md:hidden"
      >
        <Calendar size={14} />
        <span className="text-xs font-medium">Filtri &amp; Periodo</span>
        <Clock3 size={14} className="text-accent-primary" />
      </button>

      {/* Main button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden w-full items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-white transition-colors hover:bg-white/[0.02] md:flex md:w-auto"
      >
        <Calendar size={14} />
        <span className="text-xs font-medium">{currentLabel}</span>
        <ChevronDown
          size={12}
          style={{
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-72 rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-y-auto max-h-[600px]"
          style={{ borderColor: "var(--color-bg-border)" }}
        >
          {/* ── Period presets section ── */}
          <div className="p-3 border-b border-bg-border">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
              Periodo
            </div>
            <div className="space-y-1">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setPreset(option.value);
                    if (option.value !== "custom") {
                      setIsOpen(false);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                    state.preset === option.value
                      ? "bg-accent-primary/15 text-accent-primary font-medium"
                      : "text-zinc-400 hover:text-zinc-300 hover:bg-white/[0.05]"
                  }`}
                >
                  {option.label}
                  {state.preset === option.value && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>

          {/* ── Custom date range section ── */}
          {state.preset === "custom" && (
            <div className="p-3 border-b border-bg-border space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
                Range personalizzato
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-[10px] rounded border border-bg-border bg-white/[0.03] text-zinc-300 focus:outline-none focus:border-accent-primary/40"
                />
                <span className="text-zinc-600 text-xs">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-[10px] rounded border border-bg-border bg-white/[0.03] text-zinc-300 focus:outline-none focus:border-accent-primary/40"
                />
              </div>
              <button
                onClick={handleApplyCustomRange}
                disabled={!customFrom || !customTo}
                className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Applica
              </button>
            </div>
          )}

          {/* ── Comparison section ── */}
          <div className="p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
              Confronto
            </div>
            <div className="space-y-1">
              {COMPARE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setCompareMode(option.value);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                    state.compareMode === option.value
                      ? "bg-accent-primary/15 text-accent-primary font-medium"
                      : "text-zinc-400 hover:text-zinc-300 hover:bg-white/[0.05]"
                  }`}
                >
                  {option.label}
                  {state.compareMode === option.value && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[100] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtri e periodo"
        >
          <button
            aria-label="Chiudi filtri"
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px]"
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-hidden rounded-t-[26px] bg-white text-slate-700 shadow-[0_-10px_40px_rgba(15,23,42,.2)]">
            <div className="flex justify-center pt-2">
              <GripHorizontal
                size={34}
                strokeWidth={4}
                className="text-slate-400"
              />
            </div>
            <header className="flex items-center justify-between px-4 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold text-slate-800">
                  Filtri &amp; Periodo
                </h2>
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-blue-600 text-blue-600">
                  <Clock3 size={14} />
                </span>
              </div>
              <button
                aria-label="Chiudi"
                onClick={() => setIsMobileOpen(false)}
                className="rounded-full p-1.5 text-slate-500"
              >
                <X size={18} />
              </button>
            </header>
            <div className="max-h-[calc(92dvh-130px)] overflow-y-auto px-4 pb-28">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">
                Periodo
              </div>
              <div className="space-y-0.5">
                {mobileOptions.map((option) => {
                  const selected = mobileSelection === option.key;
                  return (
                    <button
                      key={option.title}
                      onClick={() => {
                        setMobileSelection(option.key);
                        setMobilePreset(option.value);
                      }}
                      className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${selected ? "bg-[#f1efe8] text-[#9b7206]" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      <Calendar
                        size={14}
                        className={`mt-1 shrink-0 ${selected ? "text-[#b4860b]" : "text-slate-400"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-5">
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                          {option.description}
                        </span>
                      </span>
                      {selected && (
                        <Check
                          size={16}
                          className="mt-1 shrink-0 text-[#a47800]"
                        />
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => setMobilePreset("custom")}
                  className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left ${mobilePreset === "custom" ? "bg-[#f1efe8] text-[#9b7206]" : "text-slate-600"}`}
                >
                  <Calendar
                    size={14}
                    className="mt-1 shrink-0 text-slate-400"
                  />
                  <span className="flex-1">
                    <span className="block text-[15px]">Custom</span>
                    <span className="block text-[11px] text-slate-500">
                      Intervallo personalizzato
                    </span>
                  </span>
                  {mobilePreset === "custom" && (
                    <Check size={16} className="mt-1 text-[#a47800]" />
                  )}
                </button>
              </div>
              {mobilePreset === "custom" && (
                <div className="mt-1 flex gap-2 px-3 pb-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs"
                  />
                </div>
              )}
              <div className="mb-2 mt-2 text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">
                Confronto
              </div>
              <button
                onClick={() => setMobileCompare("none")}
                className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-[14px] ${mobileCompare === "none" ? "bg-[#f1efe8] text-[#9b7206]" : "text-slate-600"}`}
              >
                Nessun confronto
                {mobileCompare === "none" && (
                  <Check size={16} className="ml-auto text-[#a47800]" />
                )}
              </button>
              <button
                onClick={() => setMobileCompare("previous_period")}
                className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-[14px] ${mobileCompare === "previous_period" ? "bg-[#f1efe8] text-[#9b7206]" : "text-slate-600"}`}
              >
                Periodo precedente
                {mobileCompare === "previous_period" && (
                  <Check size={16} className="ml-auto text-[#a47800]" />
                )}
              </button>
            </div>
            <footer className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <button
                onClick={() => {
                  setMobilePreset("today");
                  setMobileSelection("set1");
                  setMobileCompare("none");
                }}
                className="h-11 flex-1 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600"
              >
                Azzera
              </button>
              <button
                onClick={applyMobileSheet}
                className="h-11 flex-[1.9] rounded-2xl bg-[#9b7610] text-sm font-bold text-white shadow-sm"
              >
                Fatto
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
