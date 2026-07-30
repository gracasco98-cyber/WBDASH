"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtEur } from "@/lib/fmt";
import { getFlagSm } from "./FlagSvgs";

export interface CalendarEntry {
  /** YYYY-MM-DD — the Amazon depositDate (Seller Central payment date) */
  date:    string;
  status:  "received" | "next" | "estimated";
  markets: string[];
  /** netPayout if received, projectedNet if next, null if estimated */
  total:   number | null;
}

interface Props {
  entries:      CalendarEntry[];
  loading:      boolean;
  selectedDate: string | null;
  onSelect:     (entry: CalendarEntry | null) => void;
}

function fmtDay(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export default function PaymentCalendarStrip({ entries, loading, selectedDate, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  if (loading) {
    return (
      <section className="bg-bg-card border border-bg-border rounded-2xl p-5">
        <div className="h-28 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-bg-card border border-bg-border rounded-2xl p-4 md:p-5">
      {/* Strip header */}
      <div className="flex items-center mb-4">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Calendario Pagamenti
        </span>
        <span className="ml-auto text-xs text-gray-500">cicli di 14 giorni</span>
      </div>

      {/* Scrollable timeline */}
      <div className="flex items-stretch gap-1">
        <button
          onClick={() => scroll(-1)}
          className="shrink-0 p-1 self-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-bg-hover transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        <div
          ref={scrollRef}
          className="flex items-end gap-0 overflow-x-auto scrollbar-hide flex-1"
        >
          {entries.map((entry, idx) => {
            const isSelected = selectedDate === entry.date;
            return (
              <div key={entry.date} className="flex items-end shrink-0">
                <PaymentBubble
                  entry={entry}
                  isSelected={isSelected}
                  onSelect={() => onSelect(isSelected ? null : entry)}
                />
                {idx < entries.length - 1 && (
                  <DayCounter
                    from={entry.date}
                    to={entries[idx + 1].date}
                  />
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => scroll(1)}
          className="shrink-0 p-1 self-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-bg-hover transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}

// Payment bubble

interface BubbleProps {
  entry:      CalendarEntry;
  isSelected: boolean;
  onSelect:   () => void;
}

function PaymentBubble({ entry, isSelected, onSelect }: BubbleProps) {
  const isReceived = entry.status === "received";
  const isNext     = entry.status === "next";

  const borderClass =
    isReceived ? "border-emerald-200 bg-emerald-50/60"
    : isNext    ? "border-blue-200 bg-blue-50/60"
    :             "border-gray-200 bg-gray-50/60";

  const dateClass =
    isReceived ? "text-emerald-600"
    : isNext    ? "text-blue-600"
    :             "text-gray-500";

  const amountClass =
    isReceived ? "text-emerald-600"
    : isNext    ? "text-blue-600"
    :             "text-gray-400";

  const badgeClass =
    isReceived ? "bg-emerald-100 text-emerald-700"
    : isNext    ? "bg-blue-100 text-blue-700"
    :             "bg-gray-100 text-gray-500";

  const badgeLabel =
    isReceived ? "Ricevuto"
    : isNext    ? "Prossimo"
    :             "Stimato";

  const selectedRing =
    isSelected
      ? isReceived
        ? "ring-2 ring-emerald-400 shadow-md"
        : isNext
        ? "ring-2 ring-blue-400 shadow-md"
        : "ring-2 ring-gray-300 shadow-md"
      : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "shrink-0 w-[155px] border rounded-xl px-3 py-3 text-left transition-all duration-150 cursor-pointer",
        borderClass,
        selectedRing,
      ].join(" ")}
    >
      <div className="mb-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>
      <p className={`text-sm font-bold mb-1.5 ${dateClass}`}>{fmtDay(entry.date)}</p>
      <div className="flex gap-1 mb-2">
        {entry.markets.map((m) => (
          <span key={m}>{getFlagSm(m)}</span>
        ))}
      </div>
      {entry.total != null ? (
        <p className={`text-sm font-bold tracking-tight tabular-nums ${amountClass}`}>
          {fmtEur(entry.total)}
        </p>
      ) : (
        <p className="text-xs text-gray-400 italic">da calcolare</p>
      )}
    </button>
  );
}

// Day counter strip between two payment bubbles

function DayCounter({ from, to }: { from: string; to: string }) {
  const fromMs    = new Date(from + "T12:00:00").getTime();
  const toMs      = new Date(to   + "T12:00:00").getTime();
  const totalDays = Math.max(1, Math.round((toMs - fromMs) / 86_400_000));

  // Always render totalDays - 1 intermediate day bubbles
  const slots = Array.from({ length: totalDays - 1 }, (_, i) => i + 1);

  const todayMs = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  })();

  return (
    <div className="flex items-center gap-0.5 px-1 self-center">
      {slots.map((day) => {
        const slotMs       = fromMs + day * 86_400_000;
        const slotMidnight = new Date(slotMs);
        slotMidnight.setHours(0, 0, 0, 0);
        const isToday = slotMidnight.getTime() === todayMs;
        const isPast  = slotMs < Date.now();

        return (
          <div
            key={day}
            title={new Date(slotMs).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
            className={[
              "flex items-center justify-center rounded-full text-[9px] font-medium transition-colors",
              isToday
                ? "w-5 h-5 bg-amber-100 border border-amber-300 text-amber-600"
                : isPast
                ? "w-4 h-4 bg-gray-100 text-gray-400"
                : "w-4 h-4 bg-gray-50 text-gray-300",
            ].join(" ")}
          >
            {day}
          </div>
        );
      })}
    </div>
  );
}
