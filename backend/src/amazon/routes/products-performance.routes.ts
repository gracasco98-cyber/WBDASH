// products-performance.routes.ts — GET /products/performance (unified BI table)
// + PATCH endpoints for manual Product grouping (rename, move identifier).
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { resolveProductPerformance } from "../../repositories/amazon/product-performance.repo";
import { moveIdentifier, renameProduct, findAllProducts } from "../../repositories/amazon/product.repo";
import { findAdSpendForAsins } from "../../repositories/amazon/ad-spend.repo";
import { getDateRange } from "../utils/datetime";

export const productsPerformanceRouter = Router();

async function buildAdsSpendMap(
  asins: string[],
  marketplace: string,
  dateFrom: Date,
  dateTo: Date
): Promise<Map<string, { spend: number }> | undefined> {
  if (asins.length === 0) return undefined;
  const rows = await findAdSpendForAsins(prisma, { asins, marketplace, dateFrom, dateTo });
  if (rows.length === 0) return undefined;
  return new Map(rows.map((r) => [r.asin, { spend: r.spend }]));
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

    const adsSpendByAsin = await buildAdsSpendMap(asins, marketplace, dateFrom, dateTo);

    const groups = await resolveProductPerformance(prisma, {
      productIds: productIdList,
      marketplace,
      dateFrom,
      dateTo,
      adsSpendByAsin,
    });

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
