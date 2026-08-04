// products-performance.routes.ts — GET /products/performance (unified BI table)
// + PATCH endpoints for manual Product grouping (rename, move identifier).
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { resolveProductPerformance } from "../../repositories/amazon/product-performance.repo";
import { moveIdentifier, renameProduct } from "../../repositories/amazon/product.repo";
import { isAdsConfigured, getConfiguredProfiles, fetchSPAdvertisedProductReport } from "../ads-api.service";
import { getDateRange } from "../utils/datetime";

export const productsPerformanceRouter = Router();

async function buildAdsSpendMap(
  marketplace: string,
  from: string,
  to: string
): Promise<Map<string, { spend: number }> | undefined> {
  if (!(await isAdsConfigured())) return undefined;
  try {
    const profiles = await getConfiguredProfiles();
    const targetProfiles = marketplace && marketplace !== "all"
      ? profiles.filter((p) => p.marketplace === marketplace)
      : profiles;

    const map = new Map<string, { spend: number }>();
    for (const profile of targetProfiles) {
      const rows = await fetchSPAdvertisedProductReport(profile.profileId, from, to);
      for (const row of rows) {
        if (!row.advertisedAsin) continue;
        const existing = map.get(row.advertisedAsin);
        map.set(row.advertisedAsin, { spend: (existing?.spend ?? 0) + row.spend });
      }
    }
    return map;
  } catch (err) {
    console.warn("[products/performance] Ads spend unavailable, rendering '—':", err);
    return undefined;
  }
}

productsPerformanceRouter.get("/products/performance", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace = "all", productIds } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo = range.lte ?? new Date();

    const adsSpendByAsin = await buildAdsSpendMap(marketplace, dateFrom.toISOString().slice(0, 10), dateTo.toISOString().slice(0, 10));

    const groups = await resolveProductPerformance(prisma, {
      productIds: productIds ? productIds.split(",") : undefined,
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
