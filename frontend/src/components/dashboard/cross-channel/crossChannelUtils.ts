// ── Pure utility functions for CrossChannelProducts ───────────────────────────

import { AmazonProduct, AggregatedProductMarketplace, ProductPerformance } from "@/lib/api";
import { getMeta, formatEUR, formatCompact } from "@/lib/marketplaces";
import {
  MetricId, ViewConfig, DEFAULT_CONFIG, METRIC_DEFS, COL_W, LS_KEY,
  ChannelRow, ProductRow, ChannelGroup, AMAZON_ORANGE, CHANNEL_FLAGS,
} from "./crossChannelTypes";

// Re-export formatCompact and formatEUR for sub-components
export { formatCompact, formatEUR };

// ── LocalStorage config helpers ───────────────────────────────────────────────

export function loadCfg(): ViewConfig {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ViewConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export function saveCfg(c: ViewConfig) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

// ── Grid layout ───────────────────────────────────────────────────────────────

export function buildGridCols(visibleCols: MetricId[]): string {
  const enabled = METRIC_DEFS.filter(d => visibleCols.includes(d.id));
  return ["1.5rem", "2.75rem", "1fr", ...enabled.map(d => COL_W[d.id]), "1.75rem"].join(" ");
}

// ── Metric value extractor ────────────────────────────────────────────────────

export function getVal(p: ProductRow, m: MetricId): number {
  switch (m) {
    case "revenue":  return p.totalRevenue;
    case "sales":    return p.totalRevenue;
    case "orders":   return p.totalOrders;
    case "units":    return p.totalUnits;
    case "refunds":  return p.refunds ?? 0;
    case "promo":    return p.promo ?? 0;
    case "adSpend":  return p.adSpend;
    case "percentRefunds": return p.percentRefunds ?? 0;
    case "sellableReturns": return p.sellableReturns ?? 0;
    case "refundCost": return p.refundCost ?? 0;
    case "amazonFees": return p.amazonFees ?? 0;
    case "costOfGoods": return p.costOfGoods ?? 0;
    case "grossProfit": return p.grossProfit ?? 0;
    case "netProfit": return p.netProfit ?? 0;
    case "estimatedPayout": return p.estimatedPayout ?? 0;
    case "expenses": return p.expenses ?? 0;
    case "margin": return p.margin !== null && p.margin !== undefined ? p.margin : -Infinity;
    case "roi": return p.roi ?? -Infinity;
    case "bsr": return p.bsr ?? Infinity;
    case "realAcos": return p.realAcos ?? -Infinity;
    case "sessionsDay": return p.sessionsDay ?? 0;
    case "unitSoldSessionPct": return p.unitSoldSessionPct ?? 0;
    case "shippingCosts": return p.shippingCosts ?? 0;
  }
}

// ── Simple metric formatter ───────────────────────────────────────────────────

export function fmtSimple(m: MetricId, val: number): string {
  if (val === -Infinity || val === Infinity) return "—";

  switch (m) {
    case "revenue":
    case "sales":
    case "adSpend":
    case "refundCost":
    case "amazonFees":
    case "costOfGoods":
    case "grossProfit":
    case "netProfit":
    case "estimatedPayout":
    case "expenses":
    case "shippingCosts":
      return formatCompact(val);

    case "margin":
    case "percentRefunds":
    case "unitSoldSessionPct":
      return val > -Infinity ? val.toFixed(1) + "%" : "—";

    case "roi":
    case "realAcos":
      return val > -Infinity ? val.toFixed(1) + "%" : "—";

    case "bsr":
      return val < Infinity ? Math.floor(val).toLocaleString("it-IT") : "—";

    case "sessionsDay":
      return val.toLocaleString("it-IT");

    case "refunds":
    case "promo":
    case "sellableReturns":
    default:
      return val.toLocaleString("it-IT");
  }
}

// ── Data builders ─────────────────────────────────────────────────────────────

export function buildShopifyProducts(shopifyRaw: ProductPerformance[]): ProductRow[] {
  const byKey = new Map<string, ProductRow>();
  for (const p of shopifyRaw) {
    const key = p.sku?.trim() ? p.sku.trim() : p.shopifyProductId;
    const meta = getMeta(p.marketplace);
    const ch: ChannelRow = {
      source: "shopify", channelKey: p.marketplace, label: meta.label, color: meta.color,
      revenue: p.grossRevenue, orders: p.orderCount, units: p.unitsSold, adSpend: 0,
    };
    const existing = byKey.get(key);
    if (existing) {
      existing.totalRevenue += p.grossRevenue;
      existing.totalOrders  += p.orderCount;
      existing.totalUnits   += p.unitsSold;
      existing.channels.push(ch);
      if (!existing.imageUrl && p.imageUrl) existing.imageUrl = p.imageUrl;
    } else {
      byKey.set(key, {
        id: `shop-${key}`, source: "shopify", sku: p.sku ?? null, asin: null,
        productTitle: p.productTitle, imageUrl: p.imageUrl, totalRevenue: p.grossRevenue,
        totalOrders: p.orderCount, totalUnits: p.unitsSold, adSpend: 0,
        marginPct: null, grossProfit: null, hasCogs: false, estFees: 0, channels: [ch],
      });
    }
  }
  return [...byKey.values()].map(r => ({ ...r, channels: r.channels.sort((a, b) => b.revenue - a.revenue) }));
}

export function buildAmazonProducts(
  amazonPerMp: { mp: string; products: AmazonProduct[] }[],
  imageMap: Record<string, string> = {}
): ProductRow[] {
  const byKey = new Map<string, ProductRow>();
  for (const { mp, products } of amazonPerMp) {
    for (const p of products) {
      const key = p.asin;
      const ch: ChannelRow = {
        source: "amazon", channelKey: `AMAZON_${mp}`, label: `Amazon ${mp}`, color: AMAZON_ORANGE,
        revenue: p.grossRevenue, orders: p.orderCount, units: p.unitsSold, adSpend: p.adSpend,
      };
      const existing = byKey.get(key);
      if (existing) {
        existing.totalRevenue += p.grossRevenue;
        existing.totalOrders  += p.orderCount;
        existing.totalUnits   += p.unitsSold;
        existing.adSpend      += p.adSpend;
        existing.estFees      += p.estFees;
        existing.channels.push(ch);
        if (p.hasCogs && !existing.hasCogs) {
          existing.hasCogs = true;
          existing.marginPct = p.marginPct;
          existing.grossProfit = p.grossProfit;
        }
        if (!existing.imageUrl) existing.imageUrl = imageMap[p.asin] || (p as any).imageUrl || null;
        if (!existing.sku && p.sku) existing.sku = p.sku;
      } else {
        const imgUrl = imageMap[p.asin] || (p as any).imageUrl || null;
        byKey.set(key, {
          id: `amzn-${key}`, source: "amazon", sku: p.sku ?? null, asin: p.asin,
          productTitle: p.productTitle, imageUrl: imgUrl, totalRevenue: p.grossRevenue,
          totalOrders: p.orderCount, totalUnits: p.unitsSold, adSpend: p.adSpend,
          marginPct: p.marginPct, grossProfit: p.grossProfit, hasCogs: p.hasCogs,
          estFees: p.estFees, channels: [ch],
        });
      }
    }
  }
  return [...byKey.values()].map(r => ({ ...r, channels: r.channels.sort((a, b) => b.revenue - a.revenue) }));
}

export function sortProducts(products: ProductRow[], sortBy: MetricId, sortDir: "desc" | "asc"): ProductRow[] {
  return [...products].sort((a, b) => {
    const va = getVal(a, sortBy);
    const vb = getVal(b, sortBy);
    return sortDir === "desc" ? vb - va : va - vb;
  });
}

export function buildChannelGroups(
  shopifyProducts: ProductRow[],
  amazonProducts: ProductRow[],
  sortBy: MetricId,
  sortDir: "desc" | "asc"
): ChannelGroup[] {
  const groups: ChannelGroup[] = [];

  // Amazon channels
  const amazonByMp = new Map<string, ProductRow[]>();
  for (const p of amazonProducts) {
    for (const ch of p.channels) {
      const mp = ch.channelKey;
      if (!amazonByMp.has(mp)) amazonByMp.set(mp, []);
      amazonByMp.get(mp)!.push(p);
    }
  }

  const ampCodes = ["IT", "DE", "FR", "ES"] as const;
  for (const code of ampCodes) {
    const key = `AMAZON_${code}`;
    const rawProducts = amazonByMp.get(key) ?? [];
    if (rawProducts.length > 0) {
      const products = rawProducts.map(p => {
        const chForThisMp = p.channels.filter(ch => ch.channelKey === key);
        if (chForThisMp.length === 0) return p;
        const totalRev = chForThisMp.reduce((sum, ch) => sum + ch.revenue, 0);
        const totalOrd = chForThisMp.reduce((sum, ch) => sum + ch.orders, 0);
        const totalUn  = chForThisMp.reduce((sum, ch) => sum + ch.units, 0);
        return { ...p, totalRevenue: totalRev, totalOrders: totalOrd, totalUnits: totalUn };
      });
      const sorted = sortProducts(products, sortBy, sortDir);
      groups.push({
        channelKey: key, label: `Amazon ${code}`, color: AMAZON_ORANGE,
        flag: CHANNEL_FLAGS[key] ?? "🌐", source: "amazon",
        totalRevenue: products.reduce((sum, p) => sum + p.totalRevenue, 0),
        totalOrders:  products.reduce((sum, p) => sum + p.totalOrders, 0),
        totalUnits:   products.reduce((sum, p) => sum + p.totalUnits, 0),
        products: sorted,
      });
    }
  }

  // Shopify/Sito channels
  const shopifyByMp = new Map<string, ProductRow[]>();
  for (const p of shopifyProducts) {
    for (const ch of p.channels) {
      const mp = ch.channelKey;
      if (!shopifyByMp.has(mp)) shopifyByMp.set(mp, []);
      shopifyByMp.get(mp)!.push(p);
    }
  }

  const shopifyMps = Array.from(shopifyByMp.keys()).sort();
  for (const mp of shopifyMps) {
    const rawProducts = shopifyByMp.get(mp) ?? [];
    if (rawProducts.length > 0) {
      const products = rawProducts.map(p => {
        const chForThisMp = p.channels.filter(ch => ch.channelKey === mp);
        if (chForThisMp.length === 0) return p;
        const totalRev = chForThisMp.reduce((sum, ch) => sum + ch.revenue, 0);
        const totalOrd = chForThisMp.reduce((sum, ch) => sum + ch.orders, 0);
        const totalUn  = chForThisMp.reduce((sum, ch) => sum + ch.units, 0);
        return { ...p, totalRevenue: totalRev, totalOrders: totalOrd, totalUnits: totalUn };
      });
      const sorted = sortProducts(products, sortBy, sortDir);
      const meta = getMeta(mp);
      groups.push({
        channelKey: mp, label: meta.label, color: meta.color,
        flag: CHANNEL_FLAGS[mp] ?? "🌐", source: "shopify",
        totalRevenue: products.reduce((sum, p) => sum + p.totalRevenue, 0),
        totalOrders:  products.reduce((sum, p) => sum + p.totalOrders, 0),
        totalUnits:   products.reduce((sum, p) => sum + p.totalUnits, 0),
        products: sorted,
      });
    }
  }

  return groups;
}

export function groupProductsByIdentity(amazonProducts: ProductRow[], shopifyProducts: ProductRow[]): any[] {
  const grouped = new Map<string, any>();

  const processProducts = (products: ProductRow[]) => {
    products.forEach(p => {
      const key = p.ean || p.sku || p.productTitle || "unknown";

      if (!grouped.has(key)) {
        grouped.set(key, {
          ean: p.ean || null, sku: p.sku || null, asin: p.asin || null,
          productTitle: p.productTitle, imageUrl: p.imageUrl || null,
          totalRevenue: 0, totalOrders: 0, totalUnits: 0, adSpend: 0,
          refunds: 0, totalRefunds: 0, promo: 0, percentRefunds: 0,
          sellableReturns: 0, refundCost: 0, amazonFees: 0, costOfGoods: 0,
          grossProfit: 0, netProfit: 0, estimatedPayout: 0, expenses: 0,
          margin: 0, roi: 0, bsr: Infinity, realAcos: 0, sessionsDay: 0,
          unitSoldSessionPct: 0, shippingCosts: 0, hasCogs: false,
          channels: [] as ChannelRow[], marketplaces: [] as AggregatedProductMarketplace[], sales: 0,
        });
      }

      const existing = grouped.get(key)!;
      existing.totalRevenue += p.totalRevenue;
      existing.totalOrders  += p.totalOrders;
      existing.totalUnits   += p.totalUnits;
      existing.adSpend      += p.adSpend;
      existing.refunds      += p.refunds ?? 0;
      existing.totalRefunds += p.refunds ?? 0;
      existing.promo        += p.promo ?? 0;
      existing.sellableReturns += p.sellableReturns ?? 0;
      existing.refundCost   += p.refundCost ?? 0;
      existing.amazonFees   += p.amazonFees ?? 0;
      existing.costOfGoods  += p.costOfGoods ?? 0;
      existing.grossProfit  += p.grossProfit ?? 0;
      existing.netProfit    += p.netProfit ?? 0;
      existing.estimatedPayout += p.estimatedPayout ?? 0;
      existing.expenses     += p.expenses ?? 0;
      existing.shippingCosts += p.shippingCosts ?? 0;
      existing.sessionsDay  += p.sessionsDay ?? 0;
      if (p.bsr !== undefined && p.bsr !== null && p.bsr < existing.bsr) existing.bsr = p.bsr;
      existing.sales        += p.totalRevenue;
      if (p.hasCogs) existing.hasCogs = true;

      const existingChannelKeys = new Set(existing.channels.map((ch: ChannelRow) => `${ch.source}-${ch.channelKey}`));
      for (const ch of p.channels) {
        const chKey = `${ch.source}-${ch.channelKey}`;
        if (!existingChannelKeys.has(chKey)) {
          existing.channels.push(ch);
          existingChannelKeys.add(chKey);
        }
      }

      const existingMpKeys = new Set(existing.marketplaces.map((m: AggregatedProductMarketplace) => m.mp));
      for (const ch of p.channels) {
        if (!existingMpKeys.has(ch.channelKey)) {
          existing.marketplaces.push({ mp: ch.channelKey, label: ch.label, revenue: ch.revenue, orders: ch.orders, units: ch.units });
          existingMpKeys.add(ch.channelKey);
        }
      }
    });
  };

  processProducts(amazonProducts);
  processProducts(shopifyProducts);

  const result = Array.from(grouped.values());
  result.forEach(gp => {
    gp.percentRefunds = gp.totalRefunds && gp.totalOrders ? (gp.totalRefunds / gp.totalOrders) * 100 : 0;
    gp.unitSoldSessionPct = gp.totalUnits && gp.sessionsDay > 0 ? (gp.totalUnits / gp.sessionsDay) * 100 : 0;
    gp.roi = gp.netProfit && gp.adSpend > 0 ? (gp.netProfit / gp.adSpend) * 100 : 0;
    gp.realAcos = gp.adSpend && gp.totalRevenue > 0 ? (gp.adSpend / gp.totalRevenue) * 100 : 0;
    gp.margin = gp.grossProfit && gp.totalRevenue > 0 ? (gp.grossProfit / gp.totalRevenue) * 100 : 0;
    if (gp.bsr === Infinity) gp.bsr = null;
  });

  return result;
}
