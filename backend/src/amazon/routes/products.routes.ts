// amazon/routes/products.routes.ts — Products, P&L endpoints
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  groupAmazonItemsByAsin,
} from "../../repositories/amazon/orders.repo";
import {
  findProductSnapshotHistory,
} from "../../repositories/amazon/product-snapshots.repo";
import {
  findCogsForAsins,
} from "../../repositories/amazon/cogs.repo";
import { italyOffsetMs, getDateRange } from "../utils/datetime";

export const productsRouter = Router();

// ─── GET /products ──────────────────────────────────────────────────────────────
productsRouter.get("/products", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace, search, sortBy = "grossRevenue", sortDir = "desc" } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    const where: any = {
      purchaseDate: range,
      order: { salesChannel: { not: "Non-Amazon" } },
    };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;
    if (search) {
      where.OR = [
        { asin: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { productTitle: { contains: search, mode: "insensitive" } },
      ];
    }

    // Group by ASIN only (user wants total per product across all EU marketplaces).
    // If a marketplace filter is applied, filter items first then still group by asin.
    const groups = await groupAmazonItemsByAsin(prisma, {
      purchaseDateRange: range,
      marketplace: marketplace ?? undefined,
      search: search ?? undefined,
      excludeNonAmazon: true,
    });

    // Early exit if no data
    if (groups.length === 0) {
      return res.json({ products: [], kpis: { totalGross: 0, totalNet: 0, totalUnits: 0, totalRefunds: 0, productCount: 0 } });
    }

    const asins    = groups.map(g => g.asin);
    const asinList = asins.map(a => `'${a.replace(/'/g, "")}'`).join(",");
    const mpClause = (marketplace && marketplace !== "all")
      ? ` AND marketplace = '${marketplace.replace(/'/g, "")}'` : "";
    const fromIso  = dateFrom.toISOString();
    const toIso    = dateTo.toISOString();

    // ── 3 batch queries in parallel instead of N×3 individual queries ──────────
    type SampleRow = { asin: string; productTitle: string; sku: string | null; marketplace: string };
    type DistRow   = { asin: string; distinctOrders: number };
    type CogsRow   = { asin: string; marketplace: string; cogsPerUnit: number; shippingCost: number; vatRate: number; imageUrl: string | null; sku: string | null; productTitle: string | null };

    const [sampleRows, distRows, cogsRows] = await Promise.all([
      // Latest title/sku per ASIN (DISTINCT ON = one scan, no N round-trips)
      prisma.$queryRawUnsafe<SampleRow[]>(`
        SELECT DISTINCT ON (asin) asin, "productTitle", sku, marketplace
        FROM "AmazonOrderItem"
        WHERE asin IN (${asinList})
          AND "purchaseDate" >= '${fromIso}'::timestamp
          AND "purchaseDate" <= '${toIso}'::timestamp
          ${mpClause}
        ORDER BY asin, "purchaseDate" DESC
      `),

      // Distinct orders per ASIN in one GROUP BY scan
      prisma.$queryRawUnsafe<DistRow[]>(`
        SELECT asin, COUNT(DISTINCT "amazonOrderId")::INTEGER AS "distinctOrders"
        FROM "AmazonOrderItem"
        WHERE asin IN (${asinList})
          AND "purchaseDate" >= '${fromIso}'::timestamp
          AND "purchaseDate" <= '${toIso}'::timestamp
          ${mpClause}
        GROUP BY asin
      `),

      // All COGS for these ASINs in one query (requested marketplace preferred over ALL)
      findCogsForAsins(prisma, { asins, marketplace }) as Promise<CogsRow[]>,
    ]);

    // Build lookup maps — O(n) instead of O(n²)
    const sampleMap = new Map<string, SampleRow>(sampleRows.map(r => [r.asin, r]));
    const distMap   = new Map<string, number>(distRows.map(r => [r.asin, r.distinctOrders]));

    // COGS map: requested marketplace takes priority over ALL
    const cogsMap = new Map<string, CogsRow>();
    const preferredMarketplace = (marketplace && marketplace !== "all") ? marketplace : "IT";
    for (const c of cogsRows as CogsRow[]) {
      const existing = cogsMap.get(c.asin);
      if (!existing || (c.marketplace === preferredMarketplace && existing.marketplace !== preferredMarketplace)) {
        cogsMap.set(c.asin, c);
      }
    }

    // ── Build product rows — pure synchronous map, zero DB calls ──────────────
    const products = groups.map(g => {
      const sample     = sampleMap.get(g.asin);
      const cogsRecord = cogsMap.get(g.asin);

      const grossRevenue  = Number(g._sum.itemPrice ?? 0);
      const unitsSold     = Number(g._sum.quantityOrdered ?? 0);
      const totalDiscount = Number(g._sum.promotionDiscount ?? 0);
      const avgUnitPrice  = unitsSold > 0 ? grossRevenue / unitsSold : 0;

      const cogsPerUnit  = cogsRecord?.cogsPerUnit  ?? 0;
      const shippingCost = cogsRecord?.shippingCost ?? 0;
      const vatRate      = cogsRecord?.vatRate      ?? 0;
      const imageUrl     = cogsRecord?.imageUrl ?? null;
      const cogsTotal   = (cogsPerUnit + shippingCost) * unitsSold;
      const estFees     = grossRevenue * 0.15 + unitsSold * 3.80;
      const estPayout   = Math.max(0, grossRevenue - estFees);
      const grossProfit = estPayout - cogsTotal;
      const marginPct   = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

      return {
        asin: g.asin,
        sku: cogsRecord?.sku ?? sample?.sku ?? null,
        productTitle: cogsRecord?.productTitle ?? sample?.productTitle ?? "Unknown",
        marketplace: sample?.marketplace ?? "EU",
        imageUrl,
        unitsSold,
        grossRevenue,
        refundedAmount: 0,
        netRevenue: grossRevenue,
        orderCount: distMap.get(g.asin) ?? g._count.id,
        avgUnitPrice: Math.round(avgUnitPrice * 100) / 100,
        totalDiscount,
        adSpend: 0,
        cogsPerUnit, shippingCost, vatRate, cogsTotal,
        estFees:      Math.round(estFees      * 100) / 100,
        estPayout:    Math.round(estPayout    * 100) / 100,
        grossProfit:  Math.round(grossProfit  * 100) / 100,
        marginPct:    Math.round(marginPct    * 100) / 100,
        hasCogs: cogsPerUnit > 0,
      };
    });

    const validSortKeys = ["grossRevenue", "unitsSold", "orderCount", "netRevenue", "grossProfit", "marginPct", "estPayout", "estFees", "cogsTotal"];
    const key = validSortKeys.includes(sortBy) ? sortBy : "grossRevenue";
    products.sort((a, b) =>
      sortDir === "asc" ? (a as any)[key] - (b as any)[key] : (b as any)[key] - (a as any)[key]
    );

    res.json({
      products,
      kpis: {
        totalGross: products.reduce((s, p) => s + p.grossRevenue, 0),
        totalNet: products.reduce((s, p) => s + p.netRevenue, 0),
        totalUnits: products.reduce((s, p) => s + p.unitsSold, 0),
        totalRefunds: 0,
        productCount: products.length,
      },
    });
  } catch (err) {
    console.error("[Amazon] GET /products:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /products/:asin/history ────────────────────────────────────────────────
productsRouter.get("/products/:asin/history", async (req: Request, res: Response) => {
  try {
    const { asin } = req.params;
    const { marketplace } = req.query as Record<string, string>;

    const since = new Date(Date.now() - 90 * 86400000);
    const where: any = { asin: decodeURIComponent(asin), snapshotDate: { gte: since } };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;

    const snapshots = await findProductSnapshotHistory(prisma, {
      asin: decodeURIComponent(asin),
      from: since,
      marketplace: marketplace ?? undefined,
    });

    res.json(
      snapshots.map((s) => ({
        date: s.snapshotDate instanceof Date ? s.snapshotDate.toISOString().split("T")[0] : String(s.snapshotDate).split("T")[0],
        unitsSold: s.unitsSold,
        grossRevenue: s.grossRevenue,
        refundedAmount: s.refundedAmount,
        netRevenue: s.netRevenue,
        orderCount: s.orderCount,
        adSpend: s.adSpend,
      }))
    );
  } catch (err) {
    console.error("[Amazon] GET /products/:asin/history:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /pl ────────────────────────────────────────────────────────────────────
// Monthly P&L: Sales, Fees (settlement), AdSpend, COGS, GrossProfit, NetProfit
productsRouter.get("/pl", async (req: Request, res: Response) => {
  try {
    const { marketplace, months = "12" } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace.replace(/'/g, "") : null;
    const mths = Math.min(24, Math.max(1, parseInt(months, 10)));

    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (mths - 1), 1);
    const mpW = mpFilter ? ` AND o.marketplace = '${mpFilter}'` : "";

    type PlRow = {
      month: string; grossRevenue: number; cancelledRevenue: number;
      orderCount: number; unitsSold: number; cancelledCount: number;
    };
    // Use SUM(i.itemPrice) from AmazonOrderItem — deduplicated and accurate
    const orderRows = await prisma.$queryRawUnsafe<PlRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', o."purchaseDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN o."orderStatus" NOT IN ('Canceled','Cancelled') THEN i."itemPrice" ELSE 0 END), 0)::FLOAT8 AS "grossRevenue",
        COALESCE(SUM(CASE WHEN o."orderStatus" IN ('Canceled','Cancelled') THEN i."itemPrice" ELSE 0 END), 0)::FLOAT8 AS "cancelledRevenue",
        COUNT(DISTINCT CASE WHEN o."orderStatus" NOT IN ('Canceled','Cancelled') THEN o."amazonOrderId" END)::INTEGER AS "orderCount",
        COUNT(DISTINCT CASE WHEN o."orderStatus" IN ('Canceled','Cancelled') THEN o."amazonOrderId" END)::INTEGER AS "cancelledCount"
      FROM "AmazonOrder" o
      LEFT JOIN "AmazonOrderItem" i ON i."amazonOrderId" = o."amazonOrderId"
      WHERE o."purchaseDate" >= '${since.toISOString()}'::timestamp
        AND o."salesChannel" != 'Non-Amazon'
        ${mpW}
      GROUP BY DATE_TRUNC('month', o."purchaseDate")
      ORDER BY 1
    `);

    type UnitsRow = { month: string; unitsSold: number };
    const unitRows = await prisma.$queryRawUnsafe<UnitsRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', i."purchaseDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(i."quantityOrdered"), 0)::INTEGER AS "unitsSold"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" >= '${since.toISOString()}'::timestamp
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."salesChannel" != 'Non-Amazon'
        ${mpW}
      GROUP BY DATE_TRUNC('month', i."purchaseDate")
    `);

    // Real fees from settlement
    const adMpW = mpFilter ? ` AND marketplace = '${mpFilter}'` : "";
    type SettleRow = { month: string; commission: number; fbaFee: number; refundAmount: number; ppcCost: number; otherFees: number };
    const settleRows = await prisma.$queryRawUnsafe<SettleRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "postedDate"), 'YYYY-MM') AS month,
        -- Commission and FBA only from non-EU rows (the actual marketplace transactions)
        COALESCE(SUM(CASE WHEN marketplace NOT IN ('EU') AND "amountType" = 'Commission'                THEN ABS(amount) ELSE 0 END), 0)::FLOAT8 AS commission,
        COALESCE(SUM(CASE WHEN marketplace NOT IN ('EU') AND "amountType" = 'FBAPerUnitFulfillmentFee'  THEN ABS(amount) ELSE 0 END), 0)::FLOAT8 AS "fbaFee",
        -- Refunds: only Principal refunds from non-EU rows
        COALESCE(SUM(CASE WHEN marketplace NOT IN ('EU') AND "transactionType" = 'Refund'
                           AND "amountType" = 'Principal'                                               THEN ABS(amount) ELSE 0 END), 0)::FLOAT8 AS "refundAmount",
        -- PPC from EU service-fee rows (Cost of Advertising)
        COALESCE(SUM(CASE WHEN marketplace = 'EU' AND "amountType" = 'Cost of Advertising'             THEN ABS(amount) ELSE 0 END), 0)::FLOAT8 AS "ppcCost",
        -- Other fees from EU (storage, subscription, etc.)
        COALESCE(SUM(CASE WHEN marketplace = 'EU' AND "amountType" = 'OtherFee'                        THEN ABS(amount) ELSE 0 END), 0)::FLOAT8 AS "otherFees"
      FROM "AmazonSettlementTransaction"
      WHERE "postedDate" >= '${since.toISOString()}'::timestamp
        ${adMpW ? adMpW + " OR marketplace = 'EU'" : ""}
      GROUP BY DATE_TRUNC('month', "postedDate")
    `);

    type AdRow = { month: string; adSpend: number };
    const adRows = await prisma.$queryRawUnsafe<AdRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "snapshotDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(spend), 0)::FLOAT8 AS "adSpend"
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= '${since.toISOString().split("T")[0]}'::date
        ${adMpW}
      GROUP BY DATE_TRUNC('month', "snapshotDate")
    `);

    // COGS total from AmazonProductCogs × units sold (monthly)
    type CogsRow = { month: string; cogsTotal: number };
    const cogsRows = await prisma.$queryRawUnsafe<CogsRow[]>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', i."purchaseDate"), 'YYYY-MM') AS month,
        COALESCE(SUM(i."quantityOrdered" * COALESCE(c."cogsPerUnit", 0)), 0)::FLOAT8 AS "cogsTotal"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonOrderId" = i."amazonOrderId"
      LEFT JOIN "AmazonProductCogs" c ON (c.asin = i.asin AND (c.marketplace = i.marketplace OR c.marketplace = 'ALL'))
      WHERE i."purchaseDate" >= '${since.toISOString()}'::timestamp
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."salesChannel" != 'Non-Amazon'
        ${mpW}
      GROUP BY DATE_TRUNC('month', i."purchaseDate")
      ORDER BY 1
    `);

    // Merge all by month
    const map = new Map<string, any>();
    const getOrCreate = (month: string) => {
      if (!map.has(month)) map.set(month, {
        month, grossRevenue: 0, cancelledRevenue: 0, orderCount: 0, cancelledCount: 0,
        unitsSold: 0, commission: 0, fbaFee: 0, refundAmount: 0,
        ppcCost: 0, otherFees: 0,
        adSpend: 0, cogsTotal: 0,
      });
      return map.get(month)!;
    };
    for (const r of orderRows)  { const m = getOrCreate(r.month); Object.assign(m, r); }
    for (const r of unitRows)   { getOrCreate(r.month).unitsSold  = Number(r.unitsSold); }
    for (const r of settleRows) {
      const m = getOrCreate(r.month);
      m.commission   = Number(r.commission);
      m.fbaFee       = Number(r.fbaFee);
      m.refundAmount = Number(r.refundAmount);
      m.ppcCost      = Number(r.ppcCost);
      m.otherFees    = Number(r.otherFees);
    }
    for (const r of adRows)     { getOrCreate(r.month).adSpend    = Number(r.adSpend); }
    for (const r of cogsRows)   { getOrCreate(r.month).cogsTotal  = Number(r.cogsTotal); }

    const months_data = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).map((m) => {
      const grossRevenue = Number(m.grossRevenue);
      const refunds      = Number(m.refundAmount);
      const netSales     = grossRevenue - refunds;
      // Use real settlement fees if available, otherwise estimate
      const hasRealFees  = m.commission > 0 || m.fbaFee > 0;
      const commission   = hasRealFees ? m.commission : (grossRevenue * 0.15);
      const fbaFee       = hasRealFees ? m.fbaFee : (Number(m.unitsSold) * 3.80);
      // PPC: prefer settlement data (ppcCost) over ad snapshot (adSpend) when settlement available
      const ppcCost      = Number(m.ppcCost);    // from settlement EU rows (real bank charge)
      const otherFees    = Number(m.otherFees);  // storage, subscriptions, etc. from EU rows
      // adSpend from AmazonAdSnapshot (used only when ppcCost not yet in settlement)
      const adSpend      = Number(m.adSpend);
      // If settlement has PPC data use that as the authoritative ad spend
      const realAdSpend  = ppcCost > 0 ? ppcCost : adSpend;
      const amazonFees   = commission + fbaFee + otherFees;
      const cogsTotal    = Number(m.cogsTotal);
      const grossProfit  = netSales - amazonFees - cogsTotal;
      const netProfit    = grossProfit - realAdSpend;
      const margin       = netSales > 0 ? (netProfit / netSales) * 100 : 0;
      const roi          = cogsTotal > 0 ? (netProfit / cogsTotal) * 100 : null;
      return {
        month: m.month,
        grossRevenue, netSales, refunds,
        commission: Math.round(commission * 100) / 100,
        fbaFee: Math.round(fbaFee * 100) / 100,
        ppcCost: Math.round(ppcCost * 100) / 100,
        otherFees: Math.round(otherFees * 100) / 100,
        amazonFees: Math.round(amazonFees * 100) / 100,
        adSpend: realAdSpend,
        cogsTotal,
        grossProfit: Math.round(grossProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        margin: Math.round(margin * 10) / 10,
        roi: roi !== null ? Math.round(roi * 10) / 10 : null,
        orderCount: Number(m.orderCount),
        unitsSold: Number(m.unitsSold),
        cancelledCount: Number(m.cancelledCount),
        hasRealFees,
      };
    });

    const totals = months_data.reduce((acc, m) => ({
      grossRevenue: acc.grossRevenue + m.grossRevenue,
      netSales:     acc.netSales     + m.netSales,
      refunds:      acc.refunds      + m.refunds,
      commission:   acc.commission   + m.commission,
      fbaFee:       acc.fbaFee       + m.fbaFee,
      ppcCost:      acc.ppcCost      + m.ppcCost,
      otherFees:    acc.otherFees    + m.otherFees,
      amazonFees:   acc.amazonFees   + m.amazonFees,
      adSpend:      acc.adSpend      + m.adSpend,
      cogsTotal:    acc.cogsTotal    + m.cogsTotal,
      grossProfit:  acc.grossProfit  + m.grossProfit,
      netProfit:    acc.netProfit    + m.netProfit,
      orderCount:   acc.orderCount   + m.orderCount,
      unitsSold:    acc.unitsSold    + m.unitsSold,
    }), { grossRevenue:0, netSales:0, refunds:0, commission:0, fbaFee:0, ppcCost:0, otherFees:0, amazonFees:0, adSpend:0, cogsTotal:0, grossProfit:0, netProfit:0, orderCount:0, unitsSold:0 });

    const totalMargin = totals.netSales > 0 ? (totals.netProfit / totals.netSales) * 100 : 0;
    const totalRoi    = totals.cogsTotal > 0 ? (totals.netProfit / totals.cogsTotal) * 100 : null;

    res.json({
      months: months_data,
      totals: { ...totals, margin: Math.round(totalMargin * 10) / 10, roi: totalRoi !== null ? Math.round(totalRoi * 10) / 10 : null },
    });
  } catch (err) {
    console.error("[Amazon] GET /pl:", err);
    res.status(500).json({ error: String(err) });
  }
});
