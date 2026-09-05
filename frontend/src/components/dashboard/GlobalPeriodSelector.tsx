"use client";
import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { getPeriodLabel, getDateRangeForPreset, formatDateToIso, getTodayIso } from "@/lib/periodUtils";
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
  { value: "same_period_last_year", label: "Confronta con stesso periodo anno scorso" },
];

export default function GlobalPeriodSelector() {
  const { state, setPreset, setDateRange, setCompareMode } = usePeriodFilter();
  const [isOpen, setIsOpen] = useState(false);
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

  const currentLabel = getPeriodLabel(state.preset, state.from, state.to);
  const compareLabel = COMPARE_OPTIONS.find(c => c.value === state.compareMode)?.label || "";

  return (
    <div ref={ref} className="relative">
      {/* Main button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-bg-border bg-bg-card text-white hover:bg-white/[0.02] transition-colors"
      >
        <Calendar size={14} />
        <span className="text-xs font-medium">{currentLabel}</span>
        <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-y-auto max-h-[600px]"
          style={{ borderColor: "var(--color-bg-border)" }}>

          {/* ── Period presets section ── */}
          <div className="p-3 border-b border-bg-border">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
              Periodo
            </div>
            <div className="space-y-1">
              {PERIOD_OPTIONS.map(option => (
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
              {COMPARE_OPTIONS.map(option => (
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
    </div>
  );
}
