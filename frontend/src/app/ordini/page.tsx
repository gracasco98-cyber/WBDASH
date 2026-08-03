"use client";
import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";
import { api } from "@/lib/api";
import { mergeOrders, UnifiedOrder } from "@/lib/mergeOrders";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";

export default function OrdiniPage() {
  const { marketplace } = useMarketplaceFilter();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const includeAmazon = marketplace === "all" || isAmazonChannel(marketplace);
      const includeShopify = marketplace === "all" || !isAmazonChannel(marketplace);

      const amazonParams: Record<string, string> = { filter: "last30", limit: "100" };
      if (isAmazonChannel(marketplace)) amazonParams.marketplace = amazonChannelCode(marketplace)!;

      const shopifyParams: Record<string, string> = { filter: "last30", limit: "100" };
      if (!isAmazonChannel(marketplace) && marketplace !== "all") shopifyParams.marketplace = marketplace;

      // api.amazon.orders / api.orders wrap GET /api/amazon/orders and
      // GET /api/stats/orders respectively via the shared get<T>() helper
      // (lib/api/client.ts), which redirects to /login on 401 and throws on
      // any non-2xx — unlike a raw fetch(), which would otherwise silently
      // resolve an auth/error response into an empty order list.
      const [amazonRes, shopifyRes] = await Promise.all([
        includeAmazon ? api.amazon.orders(amazonParams) : Promise.resolve({ orders: [] }),
        includeShopify ? api.orders(shopifyParams) : Promise.resolve({ orders: [] }),
      ]);

      setOrders(mergeOrders(amazonRes.orders ?? [], shopifyRes.orders ?? []));
    } catch (e) {
      console.error("[OrdiniPage] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [marketplace]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Ordini</h1>
            {loading ? (
              <div className="text-zinc-500 text-sm py-10 text-center">Caricamento…</div>
            ) : (
              <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-6 gap-2 px-4 py-2 border-b border-bg-border text-[10px] text-zinc-600 uppercase tracking-wide">
                  <div>Canale</div><div>Ordine</div><div>Data</div><div>Marketplace</div><div>Totale</div><div>Stato</div>
                </div>
                <div className="divide-y divide-bg-border/20">
                  {orders.map(o => (
                    <div key={`${o.channel}-${o.id}`} className="grid grid-cols-6 gap-2 px-4 py-2.5 text-xs text-zinc-300">
                      <div className="capitalize">{o.channel}</div>
                      <div className="font-mono text-[11px]">{o.id}</div>
                      <div>{new Date(o.date).toLocaleDateString("it-IT")}</div>
                      <div>{o.marketplace}</div>
                      <div className="tabular-nums">{o.total.toFixed(2)} {o.currency}</div>
                      <div>{o.status}</div>
                    </div>
                  ))}
                  {orders.length === 0 && (
                    <div className="text-zinc-600 text-xs py-8 text-center">Nessun ordine nel periodo selezionato</div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
