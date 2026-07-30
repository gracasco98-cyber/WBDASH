"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api, Order, AmazonOrder } from "@/lib/api";
import { getMeta, formatEUR } from "@/lib/marketplaces";
import { Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

// Unified feed entry
interface FeedEntry {
  id: string;
  source: "shopify" | "amazon";
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  iconText: string;
  amount: number;
  createdAt: Date;
  isNew?: boolean;
}

function toFeedEntries(
  shopifyOrders: Order[],
  amazonOrders: AmazonOrder[],
): FeedEntry[] {
  const shopify: FeedEntry[] = shopifyOrders.map((o) => {
    const meta = getMeta(o.marketplaceDetected);
    return {
      id: `s-${o.id}`,
      source: "shopify",
      label: o.orderName,
      sublabel: meta.label,
      color: meta.color,
      bg: meta.bg,
      iconText: meta.label.slice(0, 2).toUpperCase(),
      amount: o.totalAmount,
      createdAt: new Date(o.createdAt),
    };
  });

  const amazon: FeedEntry[] = amazonOrders
    .filter((o) => o.orderStatus !== "Canceled" && o.orderStatus !== "Cancelled")
    .map((o) => {
      const mpLabel = `Amazon ${o.marketplace}`;
      return {
        id: `a-${o.id}`,
        source: "amazon",
        label: o.amazonOrderId.slice(-8),   // last 8 chars of order ID
        sublabel: mpLabel,
        color: "#fbbf24",
        bg: "rgba(251,191,36,0.10)",
        iconText: `A${o.marketplace}`,
        amount: o.itemTotal,
        createdAt: new Date(o.purchaseDate),
      };
    });

  return [...shopify, ...amazon]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 25);
}

export default function LiveFeed() {
  const [shopifyOrders, setShopifyOrders] = useState<Order[]>([]);
  const [amazonOrders,  setAmazonOrders]  = useState<AmazonOrder[]>([]);
  const [newIds,        setNewIds]        = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const [shopifyRes, amazonRes] = await Promise.all([
        api.orders({ filter: "today", limit: "20", page: "1" }),
        api.amazon.orders({ filter: "today", limit: "15", page: "1" }).catch(() => ({ orders: [] })),
      ]);

      setShopifyOrders((prev) => {
        const prevIds = new Set(prev.map((o) => `s-${o.id}`));
        const fresh   = shopifyRes.orders.filter((o) => !prevIds.has(`s-${o.id}`));
        if (fresh.length > 0) {
          setNewIds((ids) => {
            const next = new Set([...ids, ...fresh.map((o) => `s-${o.id}`)]);
            setTimeout(() => setNewIds(new Set()), 4000);
            return next;
          });
        }
        return shopifyRes.orders;
      });

      setAmazonOrders((prev) => {
        const prevIds = new Set(prev.map((o) => `a-${o.id}`));
        const fresh   = amazonRes.orders.filter((o) => !prevIds.has(`a-${o.id}`));
        if (fresh.length > 0) {
          setNewIds((ids) => {
            const next = new Set([...ids, ...fresh.map((o) => `a-${o.id}`)]);
            setTimeout(() => setNewIds(new Set()), 4000);
            return next;
          });
        }
        return amazonRes.orders;
      });
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const entries = useMemo(
    () => toFeedEntries(shopifyOrders, amazonOrders),
    [shopifyOrders, amazonOrders],
  );

  const amazonCount  = entries.filter((e) => e.source === "amazon").length;
  const shopifyCount = entries.filter((e) => e.source === "shopify").length;

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-bg-border shrink-0">
        <div className="live-dot w-2 h-2 rounded-full bg-accent-primary" />
        <h2 className="text-sm font-semibold text-white flex-1">Feed Live</h2>
        {/* Source counts */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-zinc-600">Shop {shopifyCount}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-amber-400/60">Amzn {amazonCount}</span>
        </div>
        <Zap size={13} className="text-accent-amber" />
        <span className="text-xs text-zinc-500">15s</span>
      </div>

      {/* Feed */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: "420px" }}>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
            <Zap size={20} className="mb-2 opacity-30" />
            <span className="text-sm">Nessun ordine oggi</span>
          </div>
        ) : (
          <div className="divide-y divide-bg-border/40">
            {entries.map((entry) => {
              const isNew = newIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className="px-4 py-3 flex items-center gap-3 transition-all duration-500"
                  style={{ background: isNew ? "rgba(110,231,183,0.05)" : "transparent" }}
                >
                  {/* Channel icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: entry.bg, color: entry.color }}
                  >
                    {entry.iconText}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-300 truncate">
                        {entry.label}
                      </span>
                      {isNew && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary font-medium shrink-0">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px]" style={{ color: entry.color, opacity: 0.7 }}>
                        {entry.sublabel}
                      </span>
                      <span className="text-[10px] text-zinc-700">·</span>
                      <span className="text-[10px] text-zinc-600">
                        {formatDistanceToNow(entry.createdAt, { locale: it, addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium tabular-nums text-white">
                      {formatEUR(entry.amount)}
                    </div>
                    {entry.source === "amazon" && (
                      <div className="text-[9px] text-amber-400/40 mt-0.5">Amazon</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-bg-border shrink-0 flex justify-between items-center">
        <span className="text-[10px] text-zinc-600">{entries.length} ordini oggi</span>
        <Link href="/amazon/orders" className="text-[10px] text-zinc-600 hover:text-amber-400 transition-colors">
          Tutti gli ordini Amazon →
        </Link>
      </div>
    </div>
  );
}
