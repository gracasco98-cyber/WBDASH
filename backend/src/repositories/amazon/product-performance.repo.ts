// product-performance.repo.ts — Resolves BI metrics per Product, joined at
// request time across AmazonOrderItem, AmazonSettlementTransaction,
// AmazonProductCogs, and AmazonInventory via ProductIdentifier. No
// materialized aggregation table in this phase (see spec §Rischi).
import type { PrismaClient } from "@prisma/client";
import { getCurrentAccountIds } from "../../context/account-context";
import { findAllProducts } from "./product.repo";
import { findInventoryForAsins } from "./inventory.repo";
import { findTransactionsForAsins } from "./settlement.repo";
import { findCogsForAsins } from "./cogs.repo";

export interface ProductPerformanceRow {
  identifierId: string;
  asin: string;
  marketplace: string;
  sku: string | null;
  units: number;
  sales: number;
  promo: number;
  refundsAmount: number;
  refundsCount: number;
  refundPct: number;
  adsSpend: number | null;
  realAcos: number | null;
  amazonFees: number;
  hasRealFees: boolean;
  hasRealCogs: boolean;
  cogs: number;
  stock: number;
  /** False when no AmazonInventory row exists for this identifier, so `stock: 0`
   *  means "unknown" rather than "checked, zero units". The UI renders "—". */
  hasStockData: boolean;
  grossProfit: number;
  netProfit: number;
  estimatedPayout: number;
  margin: number;
  roi: number;
  avgSellingPrice: number;
  bsr: number | null;
  /** Real VAT charged, summed from AmazonOrderItem.itemTax — not derived from vatRate. */
  vatAmount: number;
  /** Manually entered sales VAT rate (%) on the identifier — informational, null on the aggregate. */
  vatRate: number | null;
}

export interface ProductPerformanceGroup {
  product: { id: string; name: string; brand: string | null };
  rows: ProductPerformanceRow[];
  aggregate: ProductPerformanceRow;
}

const FEE_ESTIMATE_PCT = 0.15;
const FEE_ESTIMATE_PER_UNIT = 3.80;

function deriveMetrics(base: {
  sales: number; refundsAmount: number; amazonFees: number; cogs: number; adsSpend: number | null; units: number;
}): { grossProfit: number; netProfit: number; estimatedPayout: number; margin: number; roi: number; avgSellingPrice: number } {
  const ads = base.adsSpend ?? 0;
  const grossProfit = base.sales - base.refundsAmount - base.amazonFees - base.cogs - ads;
  const netProfit = grossProfit; // Expenses feature not built in this phase — netto = lordo (spec §Scope)
  const estimatedPayout = base.sales - base.refundsAmount - base.amazonFees - ads;
  const margin = base.sales > 0 ? netProfit / base.sales : 0;
  const roi = base.cogs > 0 ? netProfit / base.cogs : 0;
  const avgSellingPrice = base.units > 0 ? base.sales / base.units : 0;
  return { grossProfit, netProfit, estimatedPayout, margin, roi, avgSellingPrice };
}

export async function resolveProductPerformance(
  prisma: PrismaClient,
  params: {
    productIds?: string[];
    marketplace: string;
    dateFrom: Date;
    dateTo: Date;
    /** Keyed by `${marketplace}::${asin}` — same convention as every other
     *  per-identifier map below. An asin-only key would hand each marketplace's
     *  identifier row the combined cross-marketplace spend, which the product
     *  aggregate would then count once per marketplace. */
    adsSpendByKey?: Map<string, { spend: number }>;
  }
): Promise<ProductPerformanceGroup[]> {
  const products = await findAllProducts(prisma, { status: "ACTIVE" });
  const scoped = params.productIds
    ? products.filter((p) => params.productIds!.includes(p.id))
    : products;

  const amazonIdentifiers = scoped.flatMap((p) =>
    p.identifiers
      .filter((i) => i.channelType === "AMAZON" && i.asin)
      .filter((i) => !params.marketplace || params.marketplace === "all" || i.marketplace === params.marketplace)
      .map((i) => ({ ...i, productId: p.id }))
  );
  const asins = [...new Set(amazonIdentifiers.map((i) => i.asin as string))];

  if (asins.length === 0) return [];

  const [orderItemRows, transactions, cogsRows, inventoryRows] = await Promise.all([
    // Keep this source aligned with /amazon/summary: cancelled orders are not
    // sales and must not contribute revenue or units to the dashboard cards.
    // Prisma groupBy cannot filter on the related AmazonOrder status, so read
    // the matching items and aggregate them here.
    (prisma.amazonOrderItem.findMany as any)({
      where: {
        amazonAccountId: { in: getCurrentAccountIds() },
        asin: { in: asins },
        purchaseDate: { gte: params.dateFrom, lte: params.dateTo },
        order: { orderStatus: { notIn: ["Canceled", "Cancelled"] } },
      },
      select: { asin: true, marketplace: true, itemPrice: true, itemTax: true, promotionDiscount: true, quantityOrdered: true },
    }) as Promise<Array<{ asin: string; marketplace: string; itemPrice: unknown; itemTax: unknown; promotionDiscount: unknown; quantityOrdered: number | null }>>,
    findTransactionsForAsins(prisma, { asins, dateFrom: params.dateFrom, dateTo: params.dateTo }),
    findCogsForAsins(prisma, { asins, marketplace: params.marketplace }),
    findInventoryForAsins(prisma, { asins, marketplace: params.marketplace }),
  ]);

  const salesByKey = new Map<string, { units: number; sales: number; promo: number; vat: number }>();
  for (const r of orderItemRows) {
    const key = `${r.marketplace}::${r.asin}`;
    const current = salesByKey.get(key) ?? { units: 0, sales: 0, promo: 0, vat: 0 };
    salesByKey.set(key, {
      units: current.units + Number(r.quantityOrdered ?? 0),
      sales: current.sales + Number(r.itemPrice ?? 0),
      promo: current.promo + Number(r.promotionDiscount ?? 0),
      vat: current.vat + Number(r.itemTax ?? 0),
    });
  }

  const feesByKey = new Map<string, number>();
  const refundsByKey = new Map<string, { amount: number; count: number }>();
  for (const t of transactions) {
    const key = `${t.marketplace}::${t.asin}`;
    if (t.amountType === "Principal" && t.amount < 0) {
      const cur = refundsByKey.get(key) ?? { amount: 0, count: 0 };
      refundsByKey.set(key, { amount: cur.amount + Math.abs(t.amount), count: cur.count + 1 });
    } else if (t.amount < 0) {
      feesByKey.set(key, (feesByKey.get(key) ?? 0) + Math.abs(t.amount));
    }
  }

  // Keyed by `${marketplace}::${asin}` (matching salesByKey/feesByKey/refundsByKey/
  // stockByKey below) so that marketplace-specific COGS rows never collide with each
  // other or with the "ALL" fallback row for the same ASIN. findCogsForAsins returns
  // both the requested marketplace and "ALL" records — priority is applied when the
  // row is resolved below (exact marketplace match first, "ALL" fallback second).
  const cogsByKey = new Map<string, { cogsPerUnit: number; shippingCost: number }>();
  for (const c of cogsRows as Array<{ asin: string; marketplace: string; cogsPerUnit: number; shippingCost: number }>) {
    const key = `${c.marketplace}::${c.asin}`;
    cogsByKey.set(key, { cogsPerUnit: c.cogsPerUnit, shippingCost: c.shippingCost });
  }

  const stockByKey = new Map<string, number>();
  for (const inv of inventoryRows) {
    const key = `${inv.marketplace}::${inv.asin}`;
    stockByKey.set(key, (stockByKey.get(key) ?? 0) + inv.qtyTotal);
  }

  const groups: ProductPerformanceGroup[] = [];

  for (const product of scoped) {
    const productIdentifiers = amazonIdentifiers.filter((i) => i.productId === product.id);
    if (productIdentifiers.length === 0) continue;

    const rows: ProductPerformanceRow[] = productIdentifiers.map((ident) => {
      const key = `${ident.marketplace}::${ident.asin}`;
      const sold = salesByKey.get(key) ?? { units: 0, sales: 0, promo: 0, vat: 0 };
      const refund = refundsByKey.get(key) ?? { amount: 0, count: 0 };
      const realFees = feesByKey.get(key);
      const hasRealFees = realFees !== undefined;
      const amazonFees = hasRealFees ? realFees! : sold.sales * FEE_ESTIMATE_PCT + sold.units * FEE_ESTIMATE_PER_UNIT;
      const cogsInfo = cogsByKey.get(key) ?? cogsByKey.get(`ALL::${ident.asin}`);
      const hasRealCogs = cogsInfo !== undefined;
      const cogs = cogsInfo ? (cogsInfo.cogsPerUnit + cogsInfo.shippingCost) * sold.units : 0;
      const adsInfo = params.adsSpendByKey?.get(key);
      const adsSpend = adsInfo ? adsInfo.spend : null;
      const realAcos = adsSpend !== null && sold.sales > 0 ? adsSpend / sold.sales : null;

      const derived = deriveMetrics({ sales: sold.sales, refundsAmount: refund.amount, amazonFees, cogs, adsSpend, units: sold.units });

      return {
        identifierId: ident.id,
        asin: ident.asin as string,
        marketplace: ident.marketplace,
        sku: ident.sku,
        units: sold.units,
        sales: sold.sales,
        promo: sold.promo,
        refundsAmount: refund.amount,
        refundsCount: refund.count,
        refundPct: sold.sales > 0 ? refund.amount / sold.sales : 0,
        adsSpend,
        realAcos,
        amazonFees,
        hasRealFees,
        hasRealCogs,
        cogs,
        stock: stockByKey.get(key) ?? 0,
        hasStockData: stockByKey.has(key),
        bsr: null, // AmazonProductSnapshot.bsr exists but is never populated (spec §Scope, out of scope)
        vatAmount: sold.vat,
        vatRate: ident.vatRate,
        ...derived,
      };
    });

    const aggBase = rows.reduce(
      (acc, r) => ({
        units: acc.units + r.units,
        sales: acc.sales + r.sales,
        promo: acc.promo + r.promo,
        refundsAmount: acc.refundsAmount + r.refundsAmount,
        refundsCount: acc.refundsCount + r.refundsCount,
        amazonFees: acc.amazonFees + r.amazonFees,
        cogs: acc.cogs + r.cogs,
        stock: acc.stock + r.stock,
        vatAmount: acc.vatAmount + r.vatAmount,
        adsSpend: r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
        hasAnyAds: acc.hasAnyAds || r.adsSpend !== null,
        // AND-logic: the aggregate only claims "real fees" when every identifier row
        // has real settlement fees — one row falling back to the estimate must not
        // make the whole aggregate look verified. `true` is the identity element for
        // AND (same role `0` plays for the sum reducers above), so the seed must
        // start at `true` for this to combine correctly across the reduce.
        hasRealFees: acc.hasRealFees && r.hasRealFees,
        hasRealCogs: acc.hasRealCogs && r.hasRealCogs,
        hasStockData: acc.hasStockData && r.hasStockData,
      }),
      { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, vatAmount: 0, adsSpend: null as number | null, hasAnyAds: false, hasRealFees: true, hasRealCogs: true, hasStockData: true }
    );

    const aggDerived = deriveMetrics({
      sales: aggBase.sales, refundsAmount: aggBase.refundsAmount, amazonFees: aggBase.amazonFees,
      cogs: aggBase.cogs, adsSpend: aggBase.adsSpend, units: aggBase.units,
    });

    const aggregate: ProductPerformanceRow = {
      identifierId: "", asin: "", marketplace: "ALL", sku: null, bsr: null,
      units: aggBase.units, sales: aggBase.sales, promo: aggBase.promo,
      refundsAmount: aggBase.refundsAmount, refundsCount: aggBase.refundsCount,
      refundPct: aggBase.sales > 0 ? aggBase.refundsAmount / aggBase.sales : 0,
      adsSpend: aggBase.hasAnyAds ? aggBase.adsSpend : null,
      realAcos: aggBase.hasAnyAds && aggBase.adsSpend !== null && aggBase.sales > 0 ? aggBase.adsSpend / aggBase.sales : null,
      amazonFees: aggBase.amazonFees, hasRealFees: aggBase.hasRealFees, hasRealCogs: aggBase.hasRealCogs,
      cogs: aggBase.cogs, stock: aggBase.stock, hasStockData: aggBase.hasStockData,
      vatAmount: aggBase.vatAmount, vatRate: null, // a single rate across multiple identifiers isn't meaningful
      ...aggDerived,
    };

    groups.push({ product: { id: product.id, name: product.name, brand: product.brand }, rows, aggregate });
  }

  return groups;
}
