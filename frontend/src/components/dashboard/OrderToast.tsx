"use client";
import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { getMeta } from "@/lib/marketplaces";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LiveOrder {
  id:          string;
  source:      "shopify" | "amazon";
  orderName:   string;
  total:       number;
  marketplace: string;
  ts:          string;
}

interface Props {
  orders:    LiveOrder[];
  onDismiss: (id: string) => void;
}

// ─── Single sticky note ───────────────────────────────────────────────────────
function StickyNote({ order, onDismiss }: { order: LiveOrder; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(order.id), 350);
  }, [order.id, onDismiss]);

  // Auto-dismiss after 8 s
  useEffect(() => {
    const t = setTimeout(dismiss, 8000);
    return () => clearTimeout(t);
  }, [dismiss]);

  const meta      = getMeta(order.marketplace);
  const isAmazon  = order.source === "amazon";
  const accentCol = isAmazon ? "#fbbf24" : meta.color ?? "#6ee7b7";
  const timeStr   = new Date(order.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`
        relative w-[230px] rounded-xl overflow-hidden shadow-2xl
        transition-all duration-350 ease-out
        ${visible
          ? "opacity-100 translate-x-0 translate-y-0"
          : "opacity-0 -translate-x-6 translate-y-2"}
      `}
      style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: `1px solid ${accentCol}33`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accentCol}22`,
      }}
    >
      {/* Colored top strip — the "sticky" part */}
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${accentCol}cc, ${accentCol}55)` }}
      />

      <div className="px-3 pt-2.5 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {/* Channel color dot */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: accentCol, boxShadow: `0 0 6px ${accentCol}80` }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: accentCol }}>
              {isAmazon ? `Amazon ${order.marketplace}` : meta.label}
            </span>
          </div>
          <button
            onClick={dismiss}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        {/* Order name + amount */}
        <div className="space-y-0.5">
          <p className="text-[11px] text-zinc-400 font-mono tracking-wide">
            {order.orderName || "Nuovo ordine"}
          </p>
          <p className="text-xl font-bold text-white leading-tight">
            {order.total.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 mt-2.5 pt-2 border-t"
          style={{ borderColor: `${accentCol}22` }}>
          <span className="text-[9px] text-zinc-600">🛍 Ordine ricevuto alle</span>
          <span className="text-[9px] font-semibold" style={{ color: accentCol }}>{timeStr}</span>
        </div>

        {/* Progress bar — auto-dismiss indicator */}
        <AutoDismissBar duration={8000} color={accentCol} />
      </div>
    </div>
  );
}

// ─── Auto-dismiss progress bar ────────────────────────────────────────────────
function AutoDismissBar({ duration, color }: { duration: number; color: string }) {
  const [width, setWidth] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setWidth(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 50);
    return () => clearInterval(tick);
  }, [duration]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
      <div
        className="h-full transition-none"
        style={{ width: `${width}%`, backgroundColor: `${color}60` }}
      />
    </div>
  );
}

// ─── Container — bottom-left, stacks upward ───────────────────────────────────
export default function OrderToastContainer({ orders, onDismiss }: Props) {
  if (orders.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col-reverse gap-2 items-start pointer-events-none">
      {orders.map(o => (
        <div key={o.id} className="pointer-events-auto">
          <StickyNote order={o} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
