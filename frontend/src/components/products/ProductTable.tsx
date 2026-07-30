"use client";
import { useState } from "react";
import { ProductPerformance } from "@/lib/api";
import { getMeta } from "@/lib/marketplaces";
import { ChevronUp, ChevronDown, Image as ImageIcon, BarChart2, ExternalLink } from "lucide-react";
import { fmtEur, fmtNum } from "@/lib/fmt";

type SortKey = "grossRevenue" | "netRevenue" | "unitsSold" | "orderCount" | "refundedAmount";

interface Props {
  products: ProductPerformance[];
  loading: boolean;
  onDetail: (product: ProductPerformance) => void;
}

// ─── URL builder per marketplace ─────────────────────────────────────────────

const SHOPIFY_STORE = "your-store"; // myshopify store slug

function extractShopifyId(gid: string): string | null {
  if (!gid) return null;
  if (gid.startsWith("gid://shopify/Product/")) return gid.split("/").pop() ?? null;
  if (/^\d+$/.test(gid)) return gid;
  return null;
}

function getProductUrl(p: ProductPerformance): string | null {
  const query = encodeURIComponent(p.sku ?? p.productTitle ?? "");
  const mp = p.marketplace ?? "";

  if (mp === "SHOPIFY_DIRECT" || mp === "") {
    const id = extractShopifyId(p.shopifyProductId);
    if (id) return `https://admin.shopify.com/store/${SHOPIFY_STORE}/products/${id}`;
    return null;
  }
  if (mp === "REDCARE_IT")    return `https://www.redcare-pharmacy.com/it-it/search/?q=${query}`;
  if (mp === "REDCARE_DE")    return `https://www.redcare-pharmacy.com/de-de/search/?q=${query}`;
  if (mp === "TEMU_IT")       return `https://www.temu.com/search_result.html?search_key=${query}&language=it`;
  if (mp === "TEMU_ES")       return `https://www.temu.com/search_result.html?search_key=${query}&language=es`;
  if (mp === "TEMU_FR")       return `https://www.temu.com/search_result.html?search_key=${query}&language=fr`;
  if (mp === "TEMU_DE")       return `https://www.temu.com/search_result.html?search_key=${query}&language=de`;
  if (mp === "EBAY")          return `https://www.ebay.it/sch/i.html?_nkw=${query}`;
  if (mp === "BENU_FARMA")    return `https://www.benu.it/catalogsearch/result/?q=${query}`;
  if (mp === "TIKTOK")        return `https://www.tiktok.com/search?q=${query}`;
  if (mp === "ALIEXPRESS")    return `https://www.aliexpress.com/w/wholesale-${query}.html`;
  // Default: Shopify admin link when we have a valid GID
  const id = extractShopifyId(p.shopifyProductId);
  if (id) return `https://admin.shopify.com/store/${SHOPIFY_STORE}/products/${id}`;
  return null;
}

function getLinkLabel(marketplace: string): string {
  if (marketplace === "SHOPIFY_DIRECT") return "Admin Shopify";
  if (marketplace.startsWith("REDCARE")) return "Redcare";
  if (marketplace.startsWith("TEMU"))   return "Temu";
  if (marketplace === "EBAY")           return "eBay";
  if (marketplace === "BENU_FARMA")     return "Benu";
  if (marketplace === "TIKTOK")         return "TikTok";
  if (marketplace === "ALIEXPRESS")     return "AliExpress";
  return "Prodotto";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductTable({ products, loading, onDetail }: Props) {
  const [sort, setSort] = useState<SortKey>("grossRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sort !== k) return <ChevronDown size={12} className="text-zinc-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-accent-primary" />
      : <ChevronDown size={12} className="text-accent-primary" />;
  }

  const sorted = [...products].sort((a, b) =>
    sortDir === "asc" ? (a as any)[sort] - (b as any)[sort] : (b as any)[sort] - (a as any)[sort]
  );

  const Th = ({ label, k }: { label: string; k?: SortKey }) => (
    <th
      className={`px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wide whitespace-nowrap ${k ? "cursor-pointer hover:text-white select-none" : ""}`}
      onClick={() => k && handleSort(k)}
    >
      <div className="flex items-center gap-1">
        {label}
        {k && <SortIcon k={k} />}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-6">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-bg-base animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
        <PackageIcon size={40} className="mx-auto mb-3 text-zinc-600" />
        <p className="text-zinc-400">Nessun prodotto trovato nel periodo selezionato.</p>
        <p className="text-xs text-zinc-600 mt-1">I dati vengono popolati durante la sincronizzazione degli ordini.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-bg-border bg-bg-base/40">
            <tr>
              <Th label="Prodotto" />
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wide whitespace-nowrap hidden sm:table-cell">Canale</th>
              <Th label="Unità" k="unitsSold" />
              <Th label="Lordo" k="grossRevenue" />
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wide whitespace-nowrap hidden md:table-cell cursor-pointer hover:text-white select-none" onClick={() => handleSort("refundedAmount")}>
                <div className="flex items-center gap-1">Rimborsi <SortIcon k="refundedAmount" /></div>
              </th>
              <Th label="Netto" k="netRevenue" />
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell cursor-pointer hover:text-white select-none" onClick={() => handleSort("orderCount")}>
                <div className="flex items-center gap-1">Ordini <SortIcon k="orderCount" /></div>
              </th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {sorted.map((p) => {
              const meta       = getMeta(p.marketplace);
              const productUrl = getProductUrl(p);
              const linkLabel  = getLinkLabel(p.marketplace);

              return (
                <tr
                  key={`${p.shopifyProductId}-${p.marketplace}`}
                  className="hover:bg-bg-base/30 transition-colors"
                >
                  {/* Product column */}
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <div className="flex items-center gap-2 sm:gap-3">

                      {/* Clickable image */}
                      {productUrl ? (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Apri su ${linkLabel}`}
                          className="group relative w-10 h-10 rounded-lg overflow-hidden bg-bg-base border border-bg-border flex-shrink-0 flex items-center justify-center hover:border-accent-primary/50 transition-colors"
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.productTitle} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-zinc-600" />
                          )}
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-accent-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink size={10} className="text-white" />
                          </div>
                        </a>
                      ) : (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-bg-base border border-bg-border flex-shrink-0 flex items-center justify-center">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.productTitle} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-zinc-600" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0">
                        {/* Clickable title — truncated to 180px */}
                        {productUrl ? (
                          <a
                            href={productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={p.productTitle}
                            className="block text-xs sm:text-sm font-medium text-white hover:text-accent-primary transition-colors truncate max-w-[130px] sm:max-w-[180px]"
                          >
                            {p.productTitle}
                          </a>
                        ) : (
                          <div className="text-xs sm:text-sm font-medium text-white truncate max-w-[130px] sm:max-w-[180px]" title={p.productTitle}>
                            {p.productTitle}
                          </div>
                        )}

                        {p.sku && (
                          <div className="text-xs text-zinc-500 font-mono mt-0.5 truncate max-w-[180px]">
                            SKU: {p.sku}
                          </div>
                        )}

                        {/* Shopify product ID — short */}
                        <div className="text-[10px] text-zinc-700 font-mono">
                          {(() => {
                            const id = extractShopifyId(p.shopifyProductId);
                            return id ? `#${id}` : p.shopifyProductId.substring(0, 16) + "…";
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Marketplace badge */}
                  <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                  </td>

                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-mono text-white tabular-nums whitespace-nowrap">
                    {fmtNum(p.unitsSold)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-mono text-white tabular-nums whitespace-nowrap">
                    {fmtEur(p.grossRevenue)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-mono tabular-nums whitespace-nowrap hidden md:table-cell">
                    <span className={p.refundedAmount > 0 ? "text-red-400" : "text-zinc-600"}>
                      {p.refundedAmount > 0 ? `-${fmtEur(p.refundedAmount)}` : "—"}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-mono text-accent-primary tabular-nums font-medium whitespace-nowrap">
                    {fmtEur(p.netRevenue)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-zinc-400 tabular-nums whitespace-nowrap hidden lg:table-cell">
                    {fmtNum(p.orderCount)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <div className="flex items-center gap-1">
                      {productUrl && (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Apri su ${linkLabel}`}
                          className="p-1.5 rounded-lg hover:bg-bg-base border border-transparent hover:border-bg-border text-zinc-600 hover:text-accent-primary transition-all"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => onDetail(p)}
                        className="p-1.5 rounded-lg hover:bg-bg-base border border-transparent hover:border-bg-border text-zinc-500 hover:text-accent-primary transition-all"
                        title="Storico prodotto"
                      >
                        <BarChart2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PackageIcon({ size, className }: { size: number; className: string }) {
  return (
    <svg width={size} height={size} className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} points="3.27 6.96 12 12.01 20.73 6.96" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
