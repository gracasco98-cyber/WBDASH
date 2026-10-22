"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { Explain } from "@/lib/periodTileExplain";
import { fmtEur } from "./MetricRow";

const PANEL_WIDTH = 320;

/**
 * Wraps a tile box (Incasso, Margine pulito) so clicking it explains how the
 * number is calculated. It lives inside the tile's <button>, so the trigger is
 * a span with role="button" and every event stops propagating — otherwise the
 * click would also select the tile's period. The panel is portalled to <body>
 * because the tiles clip their content (overflow-hidden).
 */
export default function CalcExplainPopover({ explain, children }: { explain: Explain; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open) return setPos(null);
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8));
    setPos({ top: r.bottom + 6, left });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setPos(null);
    };
    const close = () => setPos(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Come è calcolato: ${explain.title}`}
        title="Clicca per vedere come è calcolato"
        className="relative block cursor-help rounded-[9px] outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(); }
        }}
      >
        {children}
        <Info size={11} aria-hidden className="absolute right-1.5 bottom-1.5 text-zinc-400 opacity-70" />
      </span>
      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={explain.title}
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="fixed z-50 rounded-xl border border-bg-border bg-bg-card p-3 text-left shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-300">{explain.title}</div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">{explain.intro}</p>
          <ul className="mt-2 divide-y divide-bg-border/60">
            {explain.lines.map((l) => {
              // Costs are built as -(x), so a zero cost is -0: keep its "−" sign
              // but never print "€ -0,00".
              const negative = l.amount < 0 || Object.is(l.amount, -0);
              const shown = l.amount === 0 ? 0 : l.amount;
              return (
              <li key={l.label} className={`py-1.5 ${l.info ? "opacity-70" : ""}`}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="text-zinc-300">
                    {l.info ? l.label : `${negative ? "−" : "+"} ${l.label}`}
                    {l.estimated && <span title="In parte stimato" className="ml-1 text-accent-amber">≈</span>}
                  </span>
                  <span className={`tabular-nums ${shown < 0 ? "text-accent-red" : "text-zinc-200"}`}>{fmtEur(shown)}</span>
                </div>
                {l.note && <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{l.note}</div>}
              </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-bg-border pt-2 text-[13px] font-bold">
            <span className="text-zinc-200">= {explain.total.label}</span>
            <span className={`tabular-nums ${explain.total.amount < 0 ? "text-accent-red" : "text-accent-primary"}`}>{fmtEur(explain.total.amount)}</span>
          </div>
          {explain.total.note && <div className="mt-0.5 text-right text-[10px] text-zinc-500">{explain.total.note}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
