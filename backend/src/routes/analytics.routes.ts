// analytics.routes.ts — 4 ML/statistical analytics endpoints
// All computed server-side with SQL rolling windows and statistical methods.
// No Python required: rolling averages, Z-scores and trend slopes in SQL.

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";

const router = Router();

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─── 1. DEMAND FORECASTING ───────────────────────────────────────────────────
// Linear trend on 90-day daily sales → 14-day forecast per ASIN.
// Velocity = units/day. Stock-out date estimated from latest inventory velocity.

router.get("/forecast", async (_req: Request, res: Response) => {
  try {
    // Amazon-only endpoint (no Shopify data) — let "No Amazon account in
    // scope" propagate to the outer catch below, which already returns a
    // clear 500 with the error message.
    const accountId = getCurrentAccountId();
    const since90 = daysAgo(90);
    const since7  = daysAgo(7);

    // Daily sales per ASIN (last 90 days)
    const daily = await prisma.$queryRaw<any[]>`
      SELECT
        asin,
        MAX("productTitle")           AS title,
        "snapshotDate"                AS day,
        SUM("unitsSold")::FLOAT8      AS units
      FROM "AmazonProductSnapshot"
      WHERE "snapshotDate" >= ${since90}
        AND "amazonAccountId" = ${accountId}
      GROUP BY asin, "snapshotDate"
      ORDER BY asin, "snapshotDate"
    `;

    // Group by ASIN in JS to compute stats
    const byAsin = new Map<string, { title: string; days: { day: string; units: number }[] }>();
    for (const row of daily) {
      if (!byAsin.has(row.asin)) byAsin.set(row.asin, { title: row.title, days: [] });
      byAsin.get(row.asin)!.days.push({ day: isoDate(new Date(row.day)), units: Number(row.units) });
    }

    // Latest inventory velocity from AmazonOrderItem (last 30 days)
    const velRows = await prisma.$queryRaw<any[]>`
      SELECT i.asin,
             ROUND((SUM(i."quantityOrdered")::FLOAT / 30)::NUMERIC, 2) AS "dailyVel"
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonOrderId" = i."amazonOrderId"
      WHERE i."purchaseDate" >= ${daysAgo(30)}
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."amazonAccountId" = ${accountId}
        AND i."amazonAccountId" = ${accountId}
      GROUP BY i.asin
    `;
    const velMap = new Map(velRows.map((r: any) => [r.asin, Number(r.dailyVel)]));

    const results: any[] = [];

    for (const [asin, { title, days }] of byAsin) {
      if (days.length < 7) continue; // need at least 1 week

      const units = days.map(d => d.units);
      const n = units.length;

      // Simple linear regression: y = a + bx
      const xMean = (n - 1) / 2;
      const yMean = units.reduce((s, u) => s + u, 0) / n;
      let num = 0, den = 0;
      units.forEach((u, i) => { num += (i - xMean) * (u - yMean); den += (i - xMean) ** 2; });
      const slope  = den === 0 ? 0 : num / den;
      const interc = yMean - slope * xMean;

      // Last 7-day avg
      const last7  = units.slice(-7).reduce((s, u) => s + u, 0) / 7;
      // Last 30-day avg
      const last30 = units.slice(-30).reduce((s, u) => s + u, 0) / Math.min(30, units.length);

      // 14-day forecast
      const forecast14 = Array.from({ length: 14 }, (_, i) => {
        const predicted = Math.max(0, interc + slope * (n + i));
        return { day: isoDate(new Date(Date.now() + (i + 1) * 86400000)), predicted: +predicted.toFixed(1) };
      });
      const totalForecast14 = forecast14.reduce((s, f) => s + f.predicted, 0);

      // Stock risk based on velocity
      const velocity = velMap.get(asin) ?? last7;
      const trendPct = yMean > 0 ? ((slope * 30) / yMean) * 100 : 0;

      results.push({
        asin,
        title: title ?? asin,
        velocity:          +last7.toFixed(2),
        velocity30:        +last30.toFixed(2),
        trendPctPerMonth:  +trendPct.toFixed(1),
        trendDirection:    slope > 0.05 ? "up" : slope < -0.05 ? "down" : "stable",
        forecast14Total:   +totalForecast14.toFixed(0),
        forecast14,
        reorderQty:        Math.ceil(totalForecast14 * 1.3), // +30% safety stock
        dataPoints:        n,
      });
    }

    // Sort by velocity desc
    results.sort((a, b) => b.velocity - a.velocity);

    res.json({ items: results.slice(0, 30), generatedAt: new Date() });
  } catch (err: any) {
    console.error("[Analytics] /forecast:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ─── 2. ANOMALY DETECTION ────────────────────────────────────────────────────
// Z-score of last-7d avg vs 30d rolling: |z| > 1.8 = anomaly.

router.get("/anomalies", async (_req: Request, res: Response) => {
  try {
    // Amazon-only endpoint (no Shopify data) — let "No Amazon account in
    // scope" propagate to the outer catch below.
    const accountId = getCurrentAccountId();
    const since60 = daysAgo(60);

    // Aggregate by ASIN + day
    const rows = await prisma.$queryRaw<any[]>`
      SELECT asin, MAX("productTitle") AS title,
             "snapshotDate"            AS day,
             SUM("unitsSold")::FLOAT8  AS units,
             SUM("grossRevenue")::FLOAT8 AS revenue
      FROM "AmazonProductSnapshot"
      WHERE "snapshotDate" >= ${since60}
        AND "amazonAccountId" = ${accountId}
      GROUP BY asin, "snapshotDate"
      ORDER BY asin, "snapshotDate"
    `;

    const byAsin = new Map<string, { title: string; pts: { day: string; units: number; revenue: number }[] }>();
    for (const r of rows) {
      if (!byAsin.has(r.asin)) byAsin.set(r.asin, { title: r.title, pts: [] });
      byAsin.get(r.asin)!.pts.push({ day: isoDate(new Date(r.day)), units: Number(r.units), revenue: Number(r.revenue) });
    }

    const anomalies: any[] = [];
    const stable: any[] = [];

    for (const [asin, { title, pts }] of byAsin) {
      if (pts.length < 14) continue;

      const allUnits = pts.map(p => p.units);
      // Last 7-day window
      const last7Units = allUnits.slice(-7);
      const base30     = allUnits.slice(-37, -7); // 30d baseline before last 7

      if (base30.length < 10) continue;

      const mean30 = base30.reduce((s, u) => s + u, 0) / base30.length;
      const std30  = Math.sqrt(base30.reduce((s, u) => s + (u - mean30) ** 2, 0) / base30.length);
      const avg7   = last7Units.reduce((s, u) => s + u, 0) / 7;
      const z      = std30 > 0 ? (avg7 - mean30) / std30 : 0;

      const totalRevLast7 = pts.slice(-7).reduce((s, p) => s + p.revenue, 0);
      const totalRevBase  = pts.slice(-37, -7).reduce((s, p) => s + p.revenue, 0) / Math.max(1, base30.length) * 7;

      const entry = {
        asin,
        title: title ?? asin,
        mean30d:   +mean30.toFixed(2),
        std30d:    +std30.toFixed(2),
        avg7d:     +avg7.toFixed(2),
        zScore:    +z.toFixed(2),
        changePct: mean30 > 0 ? +(((avg7 - mean30) / mean30) * 100).toFixed(1) : null,
        revLast7:  +totalRevLast7.toFixed(2),
        revDelta:  +(totalRevLast7 - totalRevBase).toFixed(2),
        series:    pts.slice(-30).map(p => ({ day: p.day, units: p.units })),
      };

      if (Math.abs(z) >= 1.8) {
        anomalies.push({
          ...entry,
          anomalyType: z > 0 ? "spike" : "drop",
          severity: Math.abs(z) >= 3 ? "high" : Math.abs(z) >= 2.5 ? "medium" : "low",
        });
      } else {
        stable.push(entry);
      }
    }

    anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
    stable.sort((a, b) => b.avg7d - a.avg7d);

    res.json({
      anomalies: anomalies.slice(0, 20),
      stable: stable.slice(0, 10),
      totalAnalyzed: byAsin.size,
      generatedAt: new Date(),
    });
  } catch (err: any) {
    console.error("[Analytics] /anomalies:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ─── 3. PPC OPTIMIZER ───────────────────────────────────────────────────────
// Segment campaigns by ACOS, compute efficiency, suggest budget reallocation.

router.get("/ppc-optimizer", async (req: Request, res: Response) => {
  try {
    // Amazon-only endpoint (no Shopify data) — let "No Amazon account in
    // scope" propagate to the outer catch below.
    const accountId = getCurrentAccountId();
    const days  = Number((req.query.days as string) ?? 30);
    const since = daysAgo(days);

    const campaigns = await prisma.$queryRaw<any[]>`
      SELECT
        "campaignId",
        MAX("campaignName")           AS name,
        MAX("campaignType")           AS type,
        SUM("impressions")::INTEGER   AS impressions,
        SUM("clicks")::INTEGER        AS clicks,
        ROUND(SUM("spend")::NUMERIC,2)  AS spend,
        ROUND(SUM("sales")::NUMERIC,2)  AS sales,
        SUM("orders")::INTEGER        AS orders,
        CASE WHEN SUM("clicks")>0
          THEN ROUND((SUM("spend")/SUM("clicks"))::NUMERIC,4) END AS "cpc",
        CASE WHEN SUM("sales")>0
          THEN ROUND((SUM("spend")/SUM("sales")*100)::NUMERIC,1) END AS acos,
        CASE WHEN SUM("spend")>0
          THEN ROUND((SUM("sales")/SUM("spend"))::NUMERIC,2) END AS roas
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= ${since}
        AND "amazonAccountId" = ${accountId}
      GROUP BY "campaignId"
      HAVING SUM("spend") > 0
      ORDER BY SUM("spend") DESC
    `;

    // Daily spend trend last 7d vs prior 7d
    const trendRows = await prisma.$queryRaw<any[]>`
      SELECT "campaignId",
        ROUND(SUM(CASE WHEN "snapshotDate" >= ${daysAgo(7)} THEN spend ELSE 0 END)::NUMERIC,2) AS "spend7d",
        ROUND(SUM(CASE WHEN "snapshotDate" <  ${daysAgo(7)} AND "snapshotDate" >= ${daysAgo(14)} THEN spend ELSE 0 END)::NUMERIC,2) AS "spendPrev7d",
        ROUND(SUM(CASE WHEN "snapshotDate" >= ${daysAgo(7)} THEN sales ELSE 0 END)::NUMERIC,2) AS "sales7d",
        ROUND(SUM(CASE WHEN "snapshotDate" <  ${daysAgo(7)} AND "snapshotDate" >= ${daysAgo(14)} THEN sales ELSE 0 END)::NUMERIC,2) AS "salesPrev7d"
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= ${daysAgo(14)}
        AND "amazonAccountId" = ${accountId}
      GROUP BY "campaignId"
    `;
    const trendMap = new Map(trendRows.map((r: any) => [r.campaignId, r]));

    const totalSpend = campaigns.reduce((s: number, c: any) => s + Number(c.spend), 0);
    const totalSales = campaigns.reduce((s: number, c: any) => s + Number(c.sales), 0);

    // Classify + suggest
    const classified = campaigns.map((c: any) => {
      const acos  = c.acos != null ? Number(c.acos) : null;
      const roas  = c.roas != null ? Number(c.roas) : null;
      const trend = trendMap.get(c.campaignId);

      let tier: string, action: string, budgetDelta: number;
      if (acos === null) {
        tier = "no_sales"; action = "Verifica targeting e offerta — nessuna conversione"; budgetDelta = -30;
      } else if (acos < 15) {
        tier = "excellent"; action = "Aumenta il budget — ottimo ROAS, margine positivo"; budgetDelta = +25;
      } else if (acos < 25) {
        tier = "good"; action = "Mantieni il budget e ottimizza le keyword peggiori"; budgetDelta = +10;
      } else if (acos < 35) {
        tier = "marginal"; action = "Riduci offerte sulle keyword con ACOS > 40% e testa varianti"; budgetDelta = -10;
      } else {
        tier = "poor"; action = "Considera di sospendere o ristrutturare la campagna"; budgetDelta = -25;
      }

      const spendPct = totalSpend > 0 ? +((Number(c.spend) / totalSpend) * 100).toFixed(1) : 0;

      return {
        ...c,
        spend:   Number(c.spend),
        sales:   Number(c.sales),
        acos,
        roas,
        tier,
        action,
        budgetDelta,
        spendPct,
        trend7d: trend
          ? {
              spend7d:     Number(trend.spend7d),
              spendPrev7d: Number(trend.spendPrev7d),
              spendDelta:  +((Number(trend.spend7d) - Number(trend.spendPrev7d))).toFixed(2),
              sales7d:     Number(trend.sales7d),
              salesPrev7d: Number(trend.salesPrev7d),
            }
          : null,
      };
    });

    // Budget reallocation: take from "poor" → give to "excellent"/"good"
    const toReduce  = classified.filter(c => ["poor","no_sales"].includes(c.tier));
    const toIncrease = classified.filter(c => ["excellent","good"].includes(c.tier));
    const savingOpportunity = toReduce.reduce((s, c) => s + c.spend * Math.abs(c.budgetDelta) / 100, 0);

    const summary = {
      totalSpend:   +totalSpend.toFixed(2),
      totalSales:   +totalSales.toFixed(2),
      overallAcos:  totalSales > 0 ? +(totalSpend / totalSales * 100).toFixed(1) : null,
      overallRoas:  totalSpend > 0 ? +(totalSales / totalSpend).toFixed(2) : null,
      excellent:    classified.filter(c => c.tier === "excellent").length,
      good:         classified.filter(c => c.tier === "good").length,
      marginal:     classified.filter(c => c.tier === "marginal").length,
      poor:         classified.filter(c => c.tier === "poor").length,
      no_sales:     classified.filter(c => c.tier === "no_sales").length,
      savingOpportunity: +savingOpportunity.toFixed(2),
      reallocationSuggestion: toIncrease.length > 0 && toReduce.length > 0
        ? `Sposta €${savingOpportunity.toFixed(0)} da ${toReduce.length} campagne inefficienti verso ${toIncrease.length} campagne con ACOS < 25%`
        : null,
    };

    res.json({ summary, campaigns: classified, period: { days, from: isoDate(since) }, generatedAt: new Date() });
  } catch (err: any) {
    console.error("[Analytics] /ppc-optimizer:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ─── 4. MARGIN PREDICTOR ────────────────────────────────────────────────────
// Trend on last 3 months of margin, forecast 30d profitability per ASIN.

router.get("/margin-predictor", async (_req: Request, res: Response) => {
  try {
    // Amazon-only endpoint (no Shopify data) — let "No Amazon account in
    // scope" propagate to the outer catch below.
    const accountId = getCurrentAccountId();
    const since90 = daysAgo(90);
    const since30 = daysAgo(30);
    const since60 = daysAgo(60);

    // Monthly margin by ASIN (last 3 months)
    const monthly = await prisma.$queryRawUnsafe<any[]>(`
      SELECT s.asin,
             MAX(s."productTitle")        AS title,
             TO_CHAR("snapshotDate",'YYYY-MM') AS month,
             SUM(s."unitsSold")::INTEGER  AS units,
             ROUND(SUM(s."grossRevenue")::NUMERIC,2) AS revenue,
             ROUND(COALESCE(MAX(c."cogsPerUnit"),0)::NUMERIC,2) AS cogs,
             ROUND(COALESCE(MAX(c."shippingCost"),0)::NUMERIC,2) AS shipping,
             -- Margine = (revenue - COGS - fee 15% - FBA 3.80/u) / revenue * 100
             CASE WHEN SUM(s."grossRevenue")>0 THEN
               ROUND((
                 SUM(s."grossRevenue")
                 - SUM(s."unitsSold") * (COALESCE(MAX(c."cogsPerUnit"),0) + COALESCE(MAX(c."shippingCost"),0))
                 - SUM(s."grossRevenue") * 0.15
                 - SUM(s."unitsSold") * 3.8
               ) / SUM(s."grossRevenue") * 100, 1)
             ELSE NULL END AS "marginPct",
             CASE WHEN SUM(s."grossRevenue")>0 THEN
               ROUND(
                 SUM(s."grossRevenue")
                 - SUM(s."unitsSold") * (COALESCE(MAX(c."cogsPerUnit"),0) + COALESCE(MAX(c."shippingCost"),0))
                 - SUM(s."grossRevenue") * 0.15
                 - SUM(s."unitsSold") * 3.8
               , 2)
             ELSE 0 END AS "marginEur"
      FROM "AmazonProductSnapshot" s
      LEFT JOIN "AmazonProductCogs" c ON c.asin = s.asin AND c."amazonAccountId" = '${accountId}'
      WHERE s."snapshotDate" >= '${isoDate(since90)}'
        AND s."amazonAccountId" = '${accountId}'
      GROUP BY s.asin, TO_CHAR("snapshotDate",'YYYY-MM')
      ORDER BY s.asin, month
    `);

    // Velocity last 30d
    const velRows = await prisma.$queryRaw<any[]>`
      SELECT i.asin,
             ROUND((SUM(i."quantityOrdered")::FLOAT/30)::NUMERIC,2) AS vel
      FROM "AmazonOrderItem" i
      JOIN "AmazonOrder" o ON o."amazonOrderId"=i."amazonOrderId"
      WHERE i."purchaseDate" >= ${since30}
        AND o."orderStatus" NOT IN ('Canceled','Cancelled')
        AND o."amazonAccountId" = ${accountId}
        AND i."amazonAccountId" = ${accountId}
      GROUP BY i.asin
    `;
    const velMap = new Map(velRows.map((r: any) => [r.asin, Number(r.vel)]));

    // Group monthly data by ASIN
    const byAsin = new Map<string, { title: string; months: any[] }>();
    for (const r of monthly) {
      if (!byAsin.has(r.asin)) byAsin.set(r.asin, { title: r.title, months: [] });
      byAsin.get(r.asin)!.months.push({
        month:     r.month,
        units:     Number(r.units),
        revenue:   Number(r.revenue),
        marginPct: r.marginPct != null ? Number(r.marginPct) : null,
        marginEur: Number(r.marginEur),
        cogs:      Number(r.cogs),
        shipping:  Number(r.shipping),
      });
    }

    const results: any[] = [];

    for (const [asin, { title, months }] of byAsin) {
      if (months.length === 0) continue;

      const validMargins = months.filter(m => m.marginPct !== null).map(m => m.marginPct!);
      const currentMargin = validMargins.at(-1) ?? null;
      const prevMargin    = validMargins.at(-2) ?? null;
      const marginTrend   = validMargins.length >= 2
        ? +((validMargins.at(-1)! - validMargins[0]) / Math.max(1, validMargins.length - 1)).toFixed(2)
        : 0;

      const velocity30 = velMap.get(asin) ?? 0;
      const latestRev  = months.at(-1)?.revenue ?? 0;
      const latestCogs = months.at(-1)?.cogs ?? 0;
      const latestShip = months.at(-1)?.shipping ?? 0;
      const avgRevPerUnit = latestRev > 0 && months.at(-1)?.units > 0
        ? latestRev / months.at(-1)!.units : 0;

      // 30d profit forecast
      const forecast30Units   = Math.round(velocity30 * 30);
      const forecast30Revenue = +(forecast30Units * avgRevPerUnit).toFixed(2);
      const forecast30Margin  = currentMargin != null
        ? +(forecast30Revenue * currentMargin / 100).toFixed(2)
        : null;

      // Break-even price (unit must cover COGS + shipping + 15% fee + 3.80 FBA)
      const breakEven = latestCogs > 0
        ? +((latestCogs + latestShip + 3.8) / (1 - 0.15)).toFixed(2)
        : null;

      results.push({
        asin,
        title: title ?? asin,
        currentMarginPct: currentMargin,
        prevMarginPct:    prevMargin,
        marginTrendPerMonth: marginTrend, // ppt per month
        marginStatus:
          currentMargin === null    ? "no_cogs"  :
          currentMargin < 0         ? "loss"     :
          currentMargin < 10        ? "warning"  :
          currentMargin < 25        ? "fair"     : "healthy",
        hasCogs: latestCogs > 0,
        cogs:    latestCogs,
        shipping: latestShip,
        breakEvenPrice: breakEven,
        avgSellingPrice: avgRevPerUnit > 0 ? +avgRevPerUnit.toFixed(2) : null,
        velocity30d:     +velocity30.toFixed(2),
        forecast30d: {
          units:   forecast30Units,
          revenue: forecast30Revenue,
          margin:  forecast30Margin,
        },
        months,
      });
    }

    // Sort: losses first, then by revenue desc
    results.sort((a, b) => {
      const order = { loss: 0, warning: 1, no_cogs: 2, fair: 3, healthy: 4 };
      const oa = order[a.marginStatus as keyof typeof order] ?? 5;
      const ob = order[b.marginStatus as keyof typeof order] ?? 5;
      return oa !== ob ? oa - ob : b.forecast30d.revenue - a.forecast30d.revenue;
    });

    const summary = {
      totalAnalyzed:  results.length,
      losses:         results.filter(r => r.marginStatus === "loss").length,
      warnings:       results.filter(r => r.marginStatus === "warning").length,
      noCogs:         results.filter(r => r.marginStatus === "no_cogs").length,
      fair:           results.filter(r => r.marginStatus === "fair").length,
      healthy:        results.filter(r => r.marginStatus === "healthy").length,
      totalForecast30dMargin: +results
        .filter(r => r.forecast30d.margin != null)
        .reduce((s, r) => s + r.forecast30d.margin, 0)
        .toFixed(2),
    };

    res.json({ summary, products: results.slice(0, 40), generatedAt: new Date() });
  } catch (err: any) {
    console.error("[Analytics] /margin-predictor:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

export default router;
