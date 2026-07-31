// amazon/routes/inventory.routes.ts — Inventory endpoints
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { upsertAmazonInventory } from "../../repositories/amazon/inventory.repo";
import { findCogsImages } from "../../repositories/amazon/cogs.repo";
import { MARKETPLACE_IDS } from "../config";
import { getCurrentAccountId } from "../../context/account-context";

export const inventoryRouter = Router();

// ─── GET /inventory ─────────────────────────────────────────────────────────────
inventoryRouter.get("/inventory", async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.query as Record<string, string>;
    const accountId = getCurrentAccountId();
    const where: any = { amazonAccountId: accountId };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;

    const inv = await (prisma as any).amazonInventory.findMany({
      where, orderBy: [{ daysRemaining: "asc" }, { qtyTotal: "asc" }],
    });

    // Enrich with sales velocity from last 30 days
    const since30 = new Date(Date.now() - 30 * 86400000);
    const mpW = marketplace && marketplace !== "all" ? ` AND o.marketplace = '${marketplace.replace(/'/g,"")}'` : "";

    type VelRow = { asin: string; dailyVelocity: number };
    const velRows = await prisma.$queryRawUnsafe<VelRow[]>(`
      SELECT
        i.asin,
        COALESCE(SUM(i."quantityOrdered"), 0)::FLOAT8 / 30.0 AS "dailyVelocity"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" >= '${since30.toISOString()}'::timestamp
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND i."amazonAccountId" = '${accountId}'
        ${mpW}
      GROUP BY i.asin
    `);
    const velMap = new Map(velRows.map((r) => [r.asin, Number(r.dailyVelocity)]));

    const enriched = inv.map((item: any) => {
      const velocity = velMap.get(item.asin) ?? item.salesVelocity ?? 0;
      const daysLeft = velocity > 0 ? Math.round(item.qtyTotal / velocity) : null;
      const status   = daysLeft === null ? "unknown"
                     : daysLeft <= 7    ? "critical"
                     : daysLeft <= 30   ? "low"
                     : daysLeft <= 60   ? "ok"
                     : "good";
      const reorderNow = daysLeft !== null && daysLeft <= (item.leadTimeDays ?? 30);
      return { ...item, salesVelocity: velocity, daysRemaining: daysLeft, status, reorderNow };
    });

    // Also include products with COGS but no inventory record yet
    const cogsProducts = await (prisma as any).amazonProductCogs.findMany({
      where: marketplace && marketplace !== "all" ? {
        amazonAccountId: accountId,
        OR: [{ marketplace }, { marketplace: "ALL" }]
      } : { amazonAccountId: accountId },
    });
    const invAsins = new Set(enriched.map((i: any) => i.asin));
    const noInvProducts = cogsProducts
      .filter((c: any) => !invAsins.has(c.asin))
      .map((c: any) => ({
        id: null, asin: c.asin, sku: c.sku, marketplace: c.marketplace,
        productTitle: c.productTitle, imageUrl: c.imageUrl,
        qtyAfn: 0, qtyMfn: 0, qtyInbound: 0, qtyReserved: 0, qtyTotal: 0,
        reorderPoint: 0, reorderQty: 0, leadTimeDays: 30,
        salesVelocity: velMap.get(c.asin) ?? 0,
        daysRemaining: null, status: "unknown", reorderNow: false,
      }));

    res.json({ inventory: [...enriched, ...noInvProducts] });
  } catch (err) {
    console.error("[Amazon] GET /inventory:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /fba-inventory ────────────────────────────────────────────────────────
// PAN-EU aware FBA inventory.
inventoryRouter.get("/fba-inventory", async (req: Request, res: Response) => {
  try {
    const { fetchFbaInventory } = await import("../sp-api.service");

    // Fetch from all EU marketplaces we're enrolled in
    const EU_MARKETS: [string, string][] = [
      ["IT", MARKETPLACE_IDS.IT],
      ["DE", MARKETPLACE_IDS.DE],
      ["FR", MARKETPLACE_IDS.FR],
      ["ES", MARKETPLACE_IDS.ES],
    ];

    // key = fnSku (unique per physical SKU in Amazon's fulfillment network)
    const byFnSku = new Map<string, {
      item: any;
      marketplaces: Set<string>;
    }>();

    for (const [code, mpId] of EU_MARKETS) {
      try {
        const items = await fetchFbaInventory(mpId);
        for (const item of items) {
          const key = item.fnSku || `${item.asin}::${item.sellerSku}`;
          if (!byFnSku.has(key)) {
            byFnSku.set(key, { item: { ...item }, marketplaces: new Set([code]) });
          } else {
            byFnSku.get(key)!.marketplaces.add(code);
          }
        }
      } catch (e) {
        console.warn(`[FBA Inventory] ${code} failed:`, String(e).slice(0, 120));
      }
    }

    // Deduplicated item list
    const dedupedItems = Array.from(byFnSku.values()).map(({ item, marketplaces }) => ({
      ...item,
      marketplaces: [...marketplaces].sort(),
      isPanEu: marketplaces.size > 1,
      marketplace: [...marketplaces][0],
    }));

    // ── Combined EU sales velocity per ASIN (30d, ALL channels) ────────────────
    const accountId = getCurrentAccountId();
    const since30 = new Date(Date.now() - 30 * 86400000);
    type VelRow = { asin: string; market: string; dailyVelocity: number };
    const velRows = await prisma.$queryRawUnsafe<VelRow[]>(`
      SELECT
        i.asin,
        CASE
          WHEN o."salesChannel" ILIKE '%amazon.it%' THEN 'IT'
          WHEN o."salesChannel" ILIKE '%amazon.de%' THEN 'DE'
          WHEN o."salesChannel" ILIKE '%amazon.fr%' THEN 'FR'
          WHEN o."salesChannel" ILIKE '%amazon.es%' THEN 'ES'
          ELSE 'OTHER'
        END AS market,
        COALESCE(SUM(i."quantityOrdered"), 0)::FLOAT8 / 30.0 AS "dailyVelocity"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonAccountId" = i."amazonAccountId" AND o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" >= '${since30.toISOString()}'::timestamp
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."salesChannel" != 'Non-Amazon'
        AND i."amazonAccountId" = '${accountId}'
      GROUP BY i.asin, market
    `);

    type VelEntry = { total: number; byMarket: Record<string, number> };
    const velMap = new Map<string, VelEntry>();
    for (const r of velRows) {
      if (!velMap.has(r.asin)) velMap.set(r.asin, { total: 0, byMarket: {} });
      const e = velMap.get(r.asin)!;
      const v = Number(r.dailyVelocity);
      e.total += v;
      e.byMarket[r.market] = (e.byMarket[r.market] ?? 0) + v;
    }

    // ── Also load catalog images (from AmazonProductCogs cache if available) ───
    const cogsImgs = await findCogsImages(prisma);
    const imgMap = new Map(cogsImgs.map(c => [c.asin, c.imageUrl!]));

    // ── Enrich with velocity + status ──────────────────────────────────────────
    const enriched = dedupedItems.map((item) => {
      const vel         = velMap.get(item.asin);
      const velTotal    = vel?.total ?? 0;
      const velByMarket = vel?.byMarket ?? {};
      const daysLeft    = velTotal > 0 ? Math.round(item.fulfillableQuantity / velTotal) : null;
      const status      = daysLeft === null ? "unknown"
                        : daysLeft <= 7    ? "critical"
                        : daysLeft <= 30   ? "low"
                        : daysLeft <= 60   ? "ok"
                        : "good";
      return {
        ...item,
        salesVelocity:    velTotal,
        salesVelocityByMarket: velByMarket,
        daysRemaining:    daysLeft,
        status,
        imageUrl:         imgMap.get(item.asin) ?? null,
      };
    });

    // Sort: critical → low → ok → good → unknown
    const ORDER: Record<string, number> = { critical: 0, low: 1, ok: 2, good: 3, unknown: 4 };
    enriched.sort((a, b) => {
      const ao = ORDER[a.status] ?? 99, bo = ORDER[b.status] ?? 99;
      if (ao !== bo) return ao - bo;
      if (a.daysRemaining !== null && b.daysRemaining !== null) return a.daysRemaining - b.daysRemaining;
      return b.fulfillableQuantity - a.fulfillableQuantity;
    });

    res.json({ items: enriched, total: enriched.length, syncedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[Amazon] GET /fba-inventory:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /inventory ───────────────────────────────────────────────────────────
inventoryRouter.post("/inventory", async (req: Request, res: Response) => {
  try {
    const { asin, sku, marketplace = "IT", productTitle, qtyAfn = 0, qtyMfn = 0, qtyInbound = 0, qtyReserved = 0, reorderPoint = 0, reorderQty = 0, leadTimeDays = 30, imageUrl } = req.body ?? {};
    if (!asin) return res.status(400).json({ error: "asin required" });
    const qtyTotal = Number(qtyAfn) + Number(qtyMfn) + Number(qtyInbound);
    const entry = await upsertAmazonInventory(prisma, {
      asin, sku, marketplace, productTitle,
      qtyAfn: Number(qtyAfn), qtyMfn: Number(qtyMfn), qtyInbound: Number(qtyInbound),
      qtyReserved: Number(qtyReserved), qtyTotal,
      reorderPoint: Number(reorderPoint), reorderQty: Number(reorderQty), leadTimeDays: Number(leadTimeDays),
      imageUrl: imageUrl ?? null,
    });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
