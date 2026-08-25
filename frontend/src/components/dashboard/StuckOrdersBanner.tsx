// StuckOrdersBanner.tsx — Warns on the homepage when a Redcare/Mirakl order
// hasn't synced into Shopify/WBDASH after a reasonable delay (unmapped
// order state, malformed data stuck retrying, etc.) — see
// backend/src/mirakl/health.ts. WBDASH has no email/Slack notifications
// today, so this banner is the only way such a problem becomes visible
// without someone checking server logs by hand.
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api, StuckMiraklOrder } from "@/lib/api";

const REASON_LABEL: Record<StuckMiraklOrder["reason"], string> = {
  unsynced: "non ancora sincronizzato",
  unrecognized: "stato Mirakl non riconosciuto",
};

export default function StuckOrdersBanner() {
  const [stuckOrders, setStuckOrders] = useState<StuckMiraklOrder[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.mirakl.stuckOrders()
      .then(({ stuckOrders }) => { if (!cancelled) setStuckOrders(stuckOrders); })
      .catch((err) => console.error("[StuckOrdersBanner] Failed to load:", err));
    return () => { cancelled = true; };
  }, []);

  if (stuckOrders.length === 0) return null;

  return (
    <div className="mb-3 rounded-[10px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-zinc-200">
      <div className="flex items-center gap-2 font-semibold text-red-400">
        <AlertTriangle size={16} />
        {stuckOrders.length === 1
          ? "1 ordine Redcare non è ancora arrivato su Shopify"
          : `${stuckOrders.length} ordini Redcare non sono ancora arrivati su Shopify`}
      </div>
      <ul className="mt-1.5 ml-6 list-disc space-y-0.5 text-zinc-400">
        {stuckOrders.map((o) => (
          <li key={o.orderId}>
            {o.orderId} — {REASON_LABEL[o.reason]}, fermo da {Math.round(o.ageHours)}h
          </li>
        ))}
      </ul>
    </div>
  );
}
