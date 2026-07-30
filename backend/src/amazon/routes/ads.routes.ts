// amazon/routes/ads.routes.ts — PPC campaigns, keywords, timeseries, ads/status, ads/daily
// Search terms cache, /ppc/products, /ppc/adgroups, /ppc/search-terms are in ppc-extra.routes.ts.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  countAdSnapshotsByDateRange,
  groupAdSnapshotsByCampaign,
} from "../../repositories/amazon/ads.repo";
import { verifyAdsConnection, quickCampaignList, getLiveCampaigns, syncKeywordMetrics } from "../ads-sync.service";
import { italyOffsetMs, getDateRange } from "../utils/datetime";

export const adsRouter = Router();

// Re-export from ppc-extra.routes.ts for backwards compatibility
// (sync.routes.ts and index.ts import _stSyncing and runSearchTermSync from here)
export { _stSyncing, runSearchTermSync } from "./ppc-extra.routes";

// ─── GET /ppc ──────────────────────────────────────────────────────────────────
// Snapshot-first approach: primary data comes from AmazonAdSnapshot
adsRouter.get("/ppc", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    let dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    let dateTo   = range.lte ?? new Date();
    const daysInPeriod = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000));

    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    let isFallback  = false;
    let dataDate: string | null = null;

    const _itz = italyOffsetMs();
    function isoSnapDate(d: Date): string {
      return new Date(d.getTime() + _itz).toISOString().split("T")[0];
    }

    if (filter === "today" || filter === "yesterday") {
      const dfStr = isoSnapDate(dateFrom);
      const dtStr = isoSnapDate(dateTo);
      const hasData = await countAdSnapshotsByDateRange(prisma, {
        from: new Date(dfStr),
        to:   new Date(dtStr),
        marketplace: mpFilter,
      });
      if (hasData === 0) {
        const latestSnap = await prisma.$queryRawUnsafe<{ d: string }[]>(
          `SELECT MAX("snapshotDate")::text AS d FROM "AmazonAdSnapshot"${mpFilter ? ` WHERE marketplace = '${mpFilter.replace(/'/g, "")}'` : ""}`
        );
        if (latestSnap[0]?.d) {
          const fallbackDate = new Date(latestSnap[0].d);
          dateFrom   = fallbackDate;
          dateTo     = fallbackDate;
          isFallback = true;
          dataDate   = latestSnap[0].d;
          console.log(`[PPC] filter=${filter} has no data — falling back to ${dataDate}`);
        }
      } else {
        const actualMax = await prisma.$queryRawUnsafe<{ d: string }[]>(
          `SELECT MAX("snapshotDate")::text AS d FROM "AmazonAdSnapshot"
           WHERE "snapshotDate" >= '${dfStr}'::date AND "snapshotDate" <= '${dtStr}'::date
           ${mpFilter ? `AND marketplace = '${mpFilter.replace(/'/g, "")}'` : ""}`
        );
        dataDate = actualMax[0]?.d ?? dfStr;
      }
    }

    const snapGroups = await groupAdSnapshotsByCampaign(prisma, {
      from: new Date(isoSnapDate(dateFrom)),
      to:   new Date(isoSnapDate(dateTo)),
      marketplace: mpFilter,
    });

    type NameRow = { campaignId: string; marketplace: string; campaignName: string; campaignType: string };
    const nameRows = await prisma.$queryRawUnsafe<NameRow[]>(`
      SELECT DISTINCT ON ("campaignId", marketplace)
        "campaignId", marketplace, "campaignName", "campaignType"
      FROM "AmazonAdSnapshot"
      ${mpFilter ? `WHERE marketplace = '${mpFilter.replace(/'/g,"")}'` : ""}
      ORDER BY "campaignId", marketplace, "snapshotDate" DESC
    `);
    const nameMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    for (const r of nameRows) {
      nameMap.set(`${r.campaignId}::${r.marketplace}`, r.campaignName);
      typeMap.set(`${r.campaignId}::${r.marketplace}`, r.campaignType ?? "SP");
    }

    const liveCampaigns = await getLiveCampaigns(mpFilter).catch(() => [] as any[]);
    const liveMap = new Map<string, any>();
    for (const lc of liveCampaigns) liveMap.set(`${lc.campaignId}::${lc.marketplace}`, lc);

    const seen = new Set<string>();
    const campaigns: any[] = [];

    for (const snap of snapGroups) {
      const key         = `${snap.campaignId}::${snap.marketplace}`;
      seen.add(key);
      const live        = liveMap.get(key);
      const spend       = snap._sum?.spend ?? 0;
      const sales       = snap._sum?.sales ?? 0;
      const clicks      = snap._sum?.clicks ?? 0;
      const impressions = snap._sum?.impressions ?? 0;
      campaigns.push({
        campaignId:   snap.campaignId,
        campaignName: nameMap.get(key) ?? live?.name ?? snap.campaignId,
        campaignType: typeMap.get(key) ?? "SP",
        marketplace:  snap.marketplace,
        state:        live ? (live.state || "UNKNOWN").toUpperCase() : "ACTIVE",
        budget:       live?.budget ?? 0,
        impressions,
        clicks,
        spend,
        sales,
        orders:       snap._sum?.orders ?? 0,
        dailySpend:   spend > 0 ? Math.round(spend / daysInPeriod * 100) / 100 : 0,
        acos:   sales > 0 ? Math.round((spend / sales) * 10000) / 100 : null,
        roas:   spend > 0 ? Math.round((sales / spend) * 100) / 100 : null,
        ctr:    impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        hasData: true,
      });
    }

    for (const lc of liveCampaigns) {
      const key = `${lc.campaignId}::${lc.marketplace}`;
      if (!seen.has(key)) {
        campaigns.push({
          campaignId:   lc.campaignId,
          campaignName: lc.name,
          marketplace:  lc.marketplace,
          state:        (lc.state || "UNKNOWN").toUpperCase(),
          budget:       lc.budget ?? 0,
          impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0,
          dailySpend: 0, acos: null, roas: null, ctr: 0,
          hasData: false,
        });
      }
    }

    campaigns.sort((a, b) => b.dailySpend - a.dailySpend);

    const totals = {
      spend:       campaigns.reduce((s, c) => s + c.spend, 0),
      sales:       campaigns.reduce((s, c) => s + c.sales, 0),
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      clicks:      campaigns.reduce((s, c) => s + c.clicks, 0),
      orders:      campaigns.reduce((s, c) => s + c.orders, 0),
    };
    const totalAcos = totals.sales > 0 ? Math.round((totals.spend / totals.sales) * 10000) / 100 : 0;

    res.json({ campaigns, totals: { ...totals, acos: totalAcos }, daysInPeriod, isFallback, dataDate });
  } catch (err) {
    console.error("[Amazon] GET /ppc:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ppc/timeseries ───────────────────────────────────────────────────────
adsRouter.get("/ppc/timeseries", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    const mpFilter = marketplace && marketplace !== "all"
      ? ` AND marketplace = '${marketplace.replace(/'/g, "")}'` : "";

    const _itz2 = italyOffsetMs();
    const tsFrom = new Date(dateFrom.getTime() + _itz2).toISOString().split("T")[0];
    const tsTo   = new Date(dateTo.getTime()   + _itz2).toISOString().split("T")[0];

    type PpcTs = { date: string | Date; spend: number | string; sales: number | string };
    const rows = await prisma.$queryRawUnsafe<PpcTs[]>(`
      SELECT
        "snapshotDate" AS date,
        COALESCE(SUM(spend), 0)::FLOAT8 AS spend,
        COALESCE(SUM(sales), 0)::FLOAT8 AS sales
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= '${tsFrom}'::date
        AND "snapshotDate" <= '${tsTo}'::date
        ${mpFilter}
      GROUP BY "snapshotDate"
      ORDER BY "snapshotDate" ASC
    `);

    res.json(
      rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0],
        spend: Number(r.spend),
        sales: Number(r.sales),
      }))
    );
  } catch (err) {
    console.error("[Amazon] GET /ppc/timeseries:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ppc/keywords ─────────────────────────────────────────────────────────
// DB-only keyword metrics (no live API calls — avoids hangs)
adsRouter.get("/ppc/keywords", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace, campaignId } = req.query as Record<string, string>;
    const range    = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const snapWhere: any = {
      snapshotDate: {
        gte: new Date(dateFrom.toISOString().split("T")[0]),
        lte: new Date(dateTo.toISOString().split("T")[0]),
      },
    };
    if (mpFilter)    snapWhere.marketplace = mpFilter;
    if (campaignId)  snapWhere.campaignId  = campaignId;

    const snapGroups = await (prisma as any).amazonAdKeywordSnapshot.groupBy({
      by: ["keywordId", "marketplace", "campaignId"],
      where: snapWhere,
      _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
    });

    if (snapGroups.length === 0) {
      return res.json({ keywords: [], total: 0 });
    }

    const mpSql  = mpFilter    ? `AND marketplace = '${mpFilter.replace(/'/g,"")}'` : "";
    const cidSql = campaignId  ? `AND "campaignId" = '${campaignId.replace(/'/g,"")}'` : "";
    type KwRow = { keywordId: string; marketplace: string; campaignId: string; keywordText: string; matchType: string };
    const kwRows = await prisma.$queryRawUnsafe<KwRow[]>(`
      SELECT DISTINCT ON ("keywordId", marketplace, "campaignId")
        "keywordId", marketplace, "campaignId", "keywordText", "matchType"
      FROM "AmazonAdKeywordSnapshot"
      WHERE "snapshotDate" >= '${dateFrom.toISOString().split("T")[0]}'::date
        AND "snapshotDate" <= '${dateTo.toISOString().split("T")[0]}'::date
        ${mpSql} ${cidSql}
      ORDER BY "keywordId", marketplace, "campaignId", "snapshotDate" DESC
    `);
    const kwMap = new Map<string, KwRow>();
    for (const r of kwRows) kwMap.set(`${r.keywordId}::${r.marketplace}::${r.campaignId}`, r);

    const keywords = snapGroups.map((g: any) => {
      const spend  = g._sum?.spend  ?? 0;
      const sales  = g._sum?.sales  ?? 0;
      const clicks = g._sum?.clicks ?? 0;
      const impr   = g._sum?.impressions ?? 0;
      const kw     = kwMap.get(`${g.keywordId}::${g.marketplace}::${g.campaignId}`);
      return {
        keywordId:   g.keywordId,
        campaignId:  g.campaignId,
        marketplace: g.marketplace,
        keywordText: kw?.keywordText ?? "",
        matchType:   kw?.matchType  ?? "EXACT",
        state:       "ENABLED",
        impressions: impr,
        clicks,
        spend,
        sales,
        orders:   g._sum?.orders ?? 0,
        acos:     sales  > 0 ? Math.round(spend / sales  * 10000) / 100 : null,
        roas:     spend  > 0 ? Math.round(sales  / spend  * 100)   / 100 : null,
        ctr:      impr   > 0 ? Math.round(clicks / impr   * 10000) / 100 : 0,
        cpc:      clicks > 0 ? Math.round(spend  / clicks * 100)   / 100 : 0,
        hasData:  true,
      };
    });

    keywords.sort((a: any, b: any) => b.spend - a.spend);
    res.json({ keywords, total: keywords.length });
  } catch (err) {
    console.error("[Amazon] GET /ppc/keywords:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ppc/campaigns/:id ────────────────────────────────────────────────────
// Campaign detail: daily timeseries + keyword breakdown for one campaign
adsRouter.get("/ppc/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range    = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    const dateFromStr = dateFrom.toISOString().split("T")[0];
    const dateToStr   = dateTo.toISOString().split("T")[0];
    const mpSql = marketplace && marketplace !== "all" ? `AND marketplace = '${marketplace.replace(/'/g,"")}'` : "";

    type DayRow = { date: string; spend: number; sales: number; clicks: number; impressions: number; orders: number };
    const daily = await prisma.$queryRawUnsafe<DayRow[]>(`
      SELECT
        "snapshotDate"::text AS date,
        COALESCE(SUM(spend), 0)::FLOAT8        AS spend,
        COALESCE(SUM(sales), 0)::FLOAT8        AS sales,
        COALESCE(SUM(clicks), 0)::INTEGER      AS clicks,
        COALESCE(SUM(impressions), 0)::INTEGER AS impressions,
        COALESCE(SUM(orders), 0)::INTEGER      AS orders
      FROM "AmazonAdSnapshot"
      WHERE "campaignId" = '${id.replace(/'/g,"")}'
        AND "snapshotDate" >= '${dateFromStr}'::date
        AND "snapshotDate" <= '${dateToStr}'::date
        ${mpSql}
      GROUP BY "snapshotDate"
      ORDER BY "snapshotDate" ASC
    `);

    const kwGroups = await (prisma as any).amazonAdKeywordSnapshot.groupBy({
      by: ["keywordId", "marketplace"],
      where: {
        campaignId:   id,
        snapshotDate: { gte: new Date(dateFromStr), lte: new Date(dateToStr) },
        ...(marketplace && marketplace !== "all" ? { marketplace } : {}),
      },
      _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
    });

    type KwRow2 = { keywordId: string; marketplace: string; keywordText: string; matchType: string };
    const kwRows = await prisma.$queryRawUnsafe<KwRow2[]>(`
      SELECT DISTINCT ON ("keywordId", marketplace)
        "keywordId", marketplace, "keywordText", "matchType"
      FROM "AmazonAdKeywordSnapshot"
      WHERE "campaignId" = '${id.replace(/'/g,"")}'
      ORDER BY "keywordId", marketplace, "snapshotDate" DESC
    `);
    const kwTextMap = new Map<string, KwRow2>();
    for (const r of kwRows) kwTextMap.set(`${r.keywordId}::${r.marketplace}`, r);

    const keywords = kwGroups.map((g: any) => {
      const spend  = g._sum?.spend  ?? 0;
      const sales  = g._sum?.sales  ?? 0;
      const clicks = g._sum?.clicks ?? 0;
      const impr   = g._sum?.impressions ?? 0;
      const kw     = kwTextMap.get(`${g.keywordId}::${g.marketplace}`);
      return {
        keywordId:   g.keywordId,
        keywordText: kw?.keywordText ?? "",
        matchType:   kw?.matchType  ?? "EXACT",
        marketplace: g.marketplace,
        impressions: impr,
        clicks,
        spend,
        sales,
        orders:   g._sum?.orders ?? 0,
        acos:     sales  > 0 ? Math.round(spend / sales  * 10000) / 100 : null,
        ctr:      impr   > 0 ? Math.round(clicks / impr   * 10000) / 100 : 0,
        cpc:      clicks > 0 ? Math.round(spend  / clicks * 100)   / 100 : 0,
      };
    });
    keywords.sort((a: any, b: any) => b.spend - a.spend);

    res.json({
      daily: daily.map((r) => ({
        ...r,
        date:  String(r.date).split("T")[0],
        spend: Number(r.spend), sales: Number(r.sales),
        clicks: Number(r.clicks), impressions: Number(r.impressions), orders: Number(r.orders),
        acos: Number(r.sales) > 0 ? Number(r.spend) / Number(r.sales) * 100 : null,
      })),
      keywords,
    });
  } catch (err) {
    console.error("[Amazon] GET /ppc/campaigns/:id:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ads/status ───────────────────────────────────────────────────────────
adsRouter.get("/ads/status", async (_req: Request, res: Response) => {
  try {
    const result = await verifyAdsConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── GET /ads/campaigns ───────────────────────────────────────────────────────
adsRouter.get("/ads/campaigns", async (req: Request, res: Response) => {
  try {
    const { marketplace = "IT" } = req.query as Record<string, string>;
    const campaigns = await quickCampaignList(marketplace);
    res.json({ campaigns, count: campaigns.length });
  } catch (err) {
    console.error("[Amazon] GET /ads/campaigns:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ads/daily ────────────────────────────────────────────────────────────
// Returns daily aggregated PPC metrics from stored snapshots
adsRouter.get("/ads/daily", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();

    const _dailyItz = italyOffsetMs();
    const _dailyFrom = new Date(dateFrom.getTime() + _dailyItz).toISOString().split("T")[0];
    const _dailyTo   = new Date(dateTo.getTime()   + _dailyItz).toISOString().split("T")[0];
    const where: any = {
      snapshotDate: {
        gte: new Date(_dailyFrom),
        lte: new Date(_dailyTo),
      },
    };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;

    type DayRow = { date: string; spend: number; sales: number; clicks: number; impressions: number; orders: number };
    const rows = await prisma.$queryRawUnsafe<DayRow[]>(`
      SELECT
        "snapshotDate"::text AS date,
        COALESCE(SUM(spend), 0)::FLOAT8       AS spend,
        COALESCE(SUM(sales), 0)::FLOAT8       AS sales,
        COALESCE(SUM(clicks), 0)::INTEGER     AS clicks,
        COALESCE(SUM(impressions), 0)::INTEGER AS impressions,
        COALESCE(SUM(orders), 0)::INTEGER     AS orders
      FROM "AmazonAdSnapshot"
      WHERE "snapshotDate" >= '${_dailyFrom}'::date
        AND "snapshotDate" <= '${_dailyTo}'::date
        ${marketplace && marketplace !== "all" ? `AND marketplace = '${marketplace.replace(/'/g,"")}'` : ""}
      GROUP BY "snapshotDate"
      ORDER BY "snapshotDate" ASC
    `);

    const totals = rows.reduce((acc, r) => ({
      spend:       acc.spend + Number(r.spend),
      sales:       acc.sales + Number(r.sales),
      clicks:      acc.clicks + Number(r.clicks),
      impressions: acc.impressions + Number(r.impressions),
      orders:      acc.orders + Number(r.orders),
    }), { spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 });

    const acos = totals.sales > 0 ? totals.spend / totals.sales * 100 : null;
    const roas = totals.spend > 0 ? totals.sales / totals.spend : null;
    const ctr  = totals.impressions > 0 ? totals.clicks / totals.impressions * 100 : null;
    const cpc  = totals.clicks > 0 ? totals.spend / totals.clicks : null;

    res.json({
      daily: rows.map((r) => ({
        date:        r.date.split("T")[0],
        spend:       Number(r.spend),
        sales:       Number(r.sales),
        clicks:      Number(r.clicks),
        impressions: Number(r.impressions),
        orders:      Number(r.orders),
        acos:        Number(r.sales) > 0 ? Number(r.spend) / Number(r.sales) * 100 : null,
      })),
      totals: { ...totals, acos, roas, ctr, cpc },
    });
  } catch (err) {
    console.error("[Amazon] GET /ads/daily:", err);
    res.status(500).json({ error: String(err) });
  }
});
