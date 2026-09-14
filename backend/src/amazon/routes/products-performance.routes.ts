// products-performance.routes.ts — GET /products/performance (unified BI table)
// + PATCH endpoints for manual Product grouping (rename, move identifier).
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { resolveProductPerformance } from "../../repositories/amazon/product-performance.repo";
import { moveIdentifier, renameProduct, findAllProducts, updateIdentifierVatRate } from "../../repositories/amazon/product.repo";
import { findAdSpendForAsins } from "../../repositories/amazon/ad-spend.repo";
import { getDateRange } from "../utils/datetime";
import { toItalyDateColumnValue } from "../../repositories/amazon/ad-spend.repo";
import { getCurrentAccountId } from "../../context/account-context";

export const productsPerformanceRouter = Router();

/**
 * Builds the ads-spend lookup keyed by `${marketplace}::${asin}` — the same
 * composite-key convention resolveProductPerformance uses for every other
 * per-identifier map (sales, fees, refunds, stock, COGS). Keying by ASIN alone
 * made every marketplace's identifier row claim the whole cross-marketplace
 * spend, which the product aggregate then double-counted.
 */
async function buildAdsSpendMap(
  asins: string[],
  marketplace: string,
  dateFrom: Date,
  dateTo: Date
): Promise<Map<string, { spend: number }> | undefined> {
  if (asins.length === 0) return undefined;
  const rows = await findAdSpendForAsins(prisma, { asins, marketplace, dateFrom, dateTo });
  if (rows.length === 0) return undefined;
  return new Map(rows.map((r) => [`${r.marketplace}::${r.asin}`, { spend: r.spend }]));
}

productsPerformanceRouter.get("/products/performance", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace = "all", productIds } = req.query as Record<string, string>;
    const range = getDateRange(from && to ? "custom" : filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo = range.lte ?? new Date();

    const productIdList = productIds ? productIds.split(",") : undefined;
    const products = await findAllProducts(prisma, { status: "ACTIVE" });
    const scoped = productIdList ? products.filter((p) => productIdList.includes(p.id)) : products;
    const asins = scoped.flatMap((p) => p.identifiers.filter((i) => i.channelType === "AMAZON" && i.asin).map((i) => i.asin as string));

    const adsSpendByKey = await buildAdsSpendMap(asins, marketplace, dateFrom, dateTo);

    const groups = await resolveProductPerformance(prisma, {
      productIds: productIdList,
      marketplace,
      dateFrom,
      dateTo,
      adsSpendByKey,
    });

    // The Ads overview is sourced from AmazonAdSnapshot (campaign totals),
    // while product rows use AmazonAdvertisedProductSnapshot (ASIN totals).
    // ASIN reports can legitimately omit campaigns without an advertised ASIN
    // (for example some headline/display campaigns), which previously made the
    // dashboard show ~77€ while Ads showed ~92€. Reconcile the difference as a
    // transparent, non-attributed row so totals always match the authoritative
    // campaign report without inventing a product allocation.
    const snapshotFrom = toItalyDateColumnValue(dateFrom);
    const snapshotTo = toItalyDateColumnValue(dateTo);
    const campaignTotal = await prisma.amazonAdSnapshot.aggregate({
      where: {
        amazonAccountId: getCurrentAccountId(),
        snapshotDate: { gte: snapshotFrom, lte: snapshotTo },
        ...(marketplace && marketplace !== "all" ? { marketplace } : {}),
      },
      _sum: { spend: true },
    });
    const authoritativeSpend = Number(campaignTotal._sum.spend ?? 0);
    const assignedSpend = groups.reduce(
      (sum, group) => sum + (group.aggregate.adsSpend ?? 0),
      0,
    );
    const unallocatedSpend = Math.max(0, authoritativeSpend - assignedSpend);
    if (unallocatedSpend > 0.005) {
      groups.push({
        product: { id: "__ads_unallocated__", name: "Ads non attribuite", brand: null },
        rows: [],
        aggregate: {
          identifierId: "__ads_unallocated__", asin: "", marketplace: marketplace === "all" ? "ALL" : marketplace,
          sku: null, units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0,
          refundPct: 0, adsSpend: unallocatedSpend, realAcos: null, amazonFees: 0,
          hasRealFees: true, hasRealCogs: true, cogs: 0, stock: 0, hasStockData: false,
          grossProfit: -unallocatedSpend, netProfit: -unallocatedSpend,
          estimatedPayout: -unallocatedSpend, margin: 0, roi: 0, avgSellingPrice: 0,
          bsr: null, vatAmount: 0, vatEstimated: false, vatRate: null,
        },
      });
    }

    res.json({ groups });
  } catch (err) {
    console.error("[GET /products/performance]", err);
    res.status(500).json({ error: "Failed to resolve product performance" });
  }
});

productsPerformanceRouter.patch("/products/:id", async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
    await renameProduct(prisma, { productId: req.params.id, name: name.trim() });
    res.status(204).send();
  } catch (err) {
    console.error("[PATCH /products/:id]", err);
    res.status(500).json({ error: "Failed to rename product" });
  }
});

productsPerformanceRouter.patch("/products/identifiers/:id", async (req: Request, res: Response) => {
  try {
    const { targetProductId } = req.body as { targetProductId?: string };
    if (!targetProductId) return res.status(400).json({ error: "targetProductId is required" });
    await moveIdentifier(prisma, { identifierId: req.params.id, targetProductId });
    res.status(204).send();
  } catch (err) {
    console.error("[PATCH /products/identifiers/:id]", err);
    res.status(500).json({ error: "Failed to move identifier" });
  }
});

productsPerformanceRouter.patch("/products/identifiers/:id/vat-rate", async (req: Request, res: Response) => {
  try {
    const { vatRate } = req.body as { vatRate?: number | null };
    if (vatRate === undefined) return res.status(400).json({ error: "vatRate is required" });
    await updateIdentifierVatRate(prisma, { identifierId: req.params.id, vatRate });
    res.status(204).send();
  } catch (err) {
    console.error("[PATCH /products/identifiers/:id/vat-rate]", err);
    res.status(500).json({ error: "Failed to update VAT rate" });
  }
});
