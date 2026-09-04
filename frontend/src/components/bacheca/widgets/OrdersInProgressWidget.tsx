"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export default function OrdersInProgressWidget() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api.acquistiDashboard.get().then(summary => setCount(summary.ordersInProgress)).catch(() => setCount(0));
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="text-[10px] uppercase tracking-wide text-amber-950/60">Ordini in corso</div>
      <div className="text-2xl font-bold text-amber-950 mt-1 tabular-nums">{count !== null ? count : "…"}</div>
    </div>
  );
}
