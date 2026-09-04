"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDateToIso } from "@/lib/periodUtils";
import { fmtEur } from "@/lib/fmt";

export default function RevenueTodayWidget() {
  const [sales, setSales] = useState<number | null>(null);

  useEffect(() => {
    const today = formatDateToIso(new Date());
    api.productPerformance.get({ marketplace: "all", from: today, to: today })
      .then(({ groups }) => setSales(groups.reduce((sum, g) => sum + g.aggregate.sales, 0)))
      .catch(() => setSales(0));
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="text-[10px] uppercase tracking-wide text-amber-950/60">Ricavi di oggi</div>
      <div className="text-2xl font-bold text-amber-950 mt-1 tabular-nums">{sales !== null ? fmtEur(sales) : "…"}</div>
    </div>
  );
}
