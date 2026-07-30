"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export type FilterValue =
  | "today"
  | "yesterday"
  | "last7"
  | "last14"
  | "month"
  | "last30"
  | "custom";

export type MarketplaceOption =
  | "all"
  | "shopify"
  | "amazon"
  | "AMAZON_IT"
  | "AMAZON_DE"
  | "AMAZON_FR"
  | "AMAZON_ES";

interface Props {
  filter: FilterValue;
  setFilter: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  marketplace: string;
  setMarketplace: (v: string) => void;
}

// ─── Period options ────────────────────────────────────────────────────────────
interface PeriodOption {
  value: FilterValue;
  label: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today",     label: "Oggi"                   },
  { value: "yesterday", label: "Ieri"                   },
  { value: "last7",     label: "7 giorni"               },
  { value: "last14",    label: "14 giorni"              },
  { value: "month",     label: "Questo mese"            },
  { value: "last30",    label: "30 giorni"              },
  { value: "custom",    label: "Intervallo personalizzato" },
];

// ─── Marketplace options ───────────────────────────────────────────────────────
interface MarketplaceGroup {
  value: string;
  label: string;
  indent?: boolean;
}

const MARKETPLACE_OPTIONS: MarketplaceGroup[] = [
  { value: "all",        label: "Tutti i canali" },
  { value: "shopify",    label: "Shopify"        },
  { value: "amazon",     label: "Amazon EU"      },
  { value: "AMAZON_IT",  label: "Amazon IT", indent: true },
  { value: "AMAZON_DE",  label: "Amazon DE", indent: true },
  { value: "AMAZON_FR",  label: "Amazon FR", indent: true },
  { value: "AMAZON_ES",  label: "Amazon ES", indent: true },
];

// ─── Shared styles ─────────────────────────────────────────────────────────────
const TRIGGER_CLS =
  "flex items-center gap-2 px-4 py-2 rounded-lg border border-bg-border " +
  "bg-bg-card text-sm text-zinc-300 hover:border-zinc-600 hover:text-white " +
  "cursor-pointer transition-colors duration-150 select-none focus:outline-none";

const PANEL_CLS =
  "absolute top-full mt-1 z-50 bg-bg-card border border-bg-border " +
  "rounded-xl shadow-2xl py-1 min-w-[200px]";

const ITEM_BASE =
  "px-3 py-2 text-sm cursor-pointer transition-colors duration-100";

// ─── Generic dropdown ──────────────────────────────────────────────────────────
interface DropdownItem {
  value: string;
  label: string;
  indent?: boolean;
}

interface DropdownProps {
  label: string;
  items: DropdownItem[];
  activeValue: string;
  onSelect: (v: string) => void;
}

function Dropdown({ label, items, activeValue, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={TRIGGER_CLS}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className={PANEL_CLS}>
          {items.map((item) => {
            const isActive = item.value === activeValue;
            return (
              <div
                key={item.value}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSelect(item.value);
                  setOpen(false);
                }}
                className={[
                  ITEM_BASE,
                  item.indent ? "pl-7" : "",
                  isActive
                    ? "text-accent-primary bg-accent-primary/10"
                    : "text-zinc-400 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {item.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function PeriodFilterBar({
  filter,
  setFilter,
  from,
  setFrom,
  to,
  setTo,
  marketplace,
  setMarketplace,
}: Props) {
  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === filter)?.label ?? "Periodo";
  const marketplaceLabel =
    MARKETPLACE_OPTIONS.find((o) => o.value === marketplace)?.label ??
    "Tutti i canali";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Period dropdown */}
      <Dropdown
        label={periodLabel}
        items={PERIOD_OPTIONS}
        activeValue={filter}
        onSelect={(v) => setFilter(v)}
      />

      {/* Custom date range inputs — shown inline when filter = "custom" */}
      {filter === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-bg-border bg-bg-base text-sm text-white focus:outline-none focus:border-accent-primary/50"
          />
          <span className="text-zinc-600 text-xs select-none">{"→"}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-bg-border bg-bg-base text-sm text-white focus:outline-none focus:border-accent-primary/50"
          />
        </div>
      )}

      {/* Marketplace dropdown */}
      <Dropdown
        label={marketplaceLabel}
        items={MARKETPLACE_OPTIONS}
        activeValue={marketplace}
        onSelect={(v) => setMarketplace(v)}
      />

      {/* Filter / apply button */}
      <button
        type="button"
        className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm font-semibold hover:bg-accent-primary/90 transition-colors duration-150 focus:outline-none"
        style={{ color: "#111" }}
      >
        Filtra
      </button>
    </div>
  );
}
