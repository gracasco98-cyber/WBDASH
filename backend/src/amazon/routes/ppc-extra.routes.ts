// amazon/routes/ppc-extra.routes.ts — Search terms cache, /ppc/products, /ppc/adgroups, /ppc/search-terms
// Split from ads.routes.ts to keep each file ≤500 LOC.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getCurrentAccountId } from "../../context/account-context";
import {
  deleteAdSearchTerms,
  createAdSearchTerms,
  groupAdSnapshotsByCampaign,
  findAdSnapshotCampaignNames,
  findLatestAdSearchTermSync,
  findAdSearchTerms,
} from "../../repositories/amazon/ads.repo";
import { getLiveStructure } from "../ads-sync.service";
import { getConfiguredProfiles, isAdsConfigured, fetchSPSearchTermReport } from "../ads-api.service";
import { italyOffsetMs, getDateRange } from "../utils/datetime";

export const ppcExtraRouter = Router();

// ─── In-memory search term cache (1-hour TTL per marketplace) ─────────────────
interface SearchTermCache {
  data:          any[];
  generatedAt:   number;
  dateFrom:      string;
  dateTo:        string;
  marketplace:   string;
}
// key = `${amazonAccountId}:${marketplace}` — plain marketplace would leak one
// account's search terms into another account's response (see
// docs/tech-debt.md, discovered during the multi-account migration).
export const _stCache = new Map<string, SearchTermCache>();
export let _stSyncing = false;

export async function runSearchTermSync(days = 30, mpFilter?: string): Promise<void> {
  if (!(await isAdsConfigured())) return;
  const amazonAccountId = getCurrentAccountId();
  _stSyncing = true;
  try {
    const profiles = (await getConfiguredProfiles()).filter(p => !mpFilter || p.marketplace === mpFilter);
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - days);
    const startDate = start.toISOString().split("T")[0];
    const endDate   = new Date(today.getTime() - 86400000).toISOString().split("T")[0];

    for (const p of profiles) {
      try {
        console.log(`[ST] Fetching search term report ${p.marketplace} ${startDate}→${endDate}`);
        const rows = await fetchSPSearchTermReport(p.profileId, startDate, endDate);
        const mapped = rows.map(r => ({
          query:        r.query,
          keywordText:  r.keywordText,
          matchType:    r.matchType,
          campaignId:   r.campaignId,
          campaignName: r.campaignName,
          adGroupId:    r.adGroupId,
          marketplace:  p.marketplace,
          impressions:  r.impressions,
          clicks:       r.clicks,
          spend:        r.spend,
          sales:        r.sales,
          orders:       r.orders,
          acos:         r.sales > 0 ? Math.round(r.spend / r.sales * 10000) / 100 : null,
          roas:         r.spend > 0 ? Math.round(r.sales / r.spend * 100)   / 100 : null,
          ctr:          r.impressions > 0 ? Math.round(r.clicks / r.impressions * 10000) / 100 : 0,
          cpc:          r.clicks > 0 ? Math.round(r.spend / r.clicks * 100) / 100 : 0,
          isWasted:     r.spend > 1 && r.orders === 0,
        }));

        // ── Persist to DB (upsert so re-syncs update existing records) ──────────
        const startDateObj = new Date(startDate);
        const endDateObj   = new Date(endDate);
        await deleteAdSearchTerms(prisma, { marketplace: p.marketplace, dateFrom: startDateObj, dateTo: endDateObj });
        await createAdSearchTerms(prisma, mapped.map(m => ({
          marketplace:  m.marketplace,
          dateFrom:     startDateObj,
          dateTo:       endDateObj,
          query:        m.query,
          keywordText:  m.keywordText,
          matchType:    m.matchType,
          campaignId:   m.campaignId,
          campaignName: m.campaignName,
          adGroupId:    m.adGroupId,
          impressions:  m.impressions,
          clicks:       m.clicks,
          spend:        m.spend,
          sales:        m.sales,
          orders:       m.orders,
          acos:         m.acos,
          roas:         m.roas,
          ctr:          m.ctr,
          cpc:          m.cpc,
          isWasted:     m.isWasted,
          syncedAt:     new Date(),
        })));

        // Also update in-memory cache for instant reads
        _stCache.set(`${amazonAccountId}:${p.marketplace}`, {
          data: mapped,
          generatedAt: Date.now(),
          dateFrom: startDate,
          dateTo: endDate,
          marketplace: p.marketplace,
        });
        console.log(`[ST] ${p.marketplace}: persisted ${mapped.length} search terms to DB`);
      } catch (e) {
        console.error(`[ST] ${p.marketplace} failed:`, String(e).slice(0, 200));
      }
    }
  } finally {
    _stSyncing = false;
  }
}

// ─── Product name extraction helper ──────────────────────────────────────────
export function extractProductInfo(campaignName: string): { product: string; asin: string | null } {
  if (!campaignName) return { product: "—", asin: null };

  const productAI = campaignName.match(/^(?:[A-Z]{2}-)?([A-Z0-9]{10})-/);
  if (productAI) return { product: productAI[1], asin: productAI[1] };

  let name = campaignName;
  name = name.replace(/^(IT|DE|FR|ES|EU|US)\s*[-–_]\s*/i, "");
  name = name.replace(/\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, "");
  name = name.replace(/\s*[-–]\s*[A-Za-z]{3}\d{4,8}\s*$/, "");
  name = name.replace(/\s+S[PBD][V]?\/[^\s]+.*$/i, "");
  name = name.replace(/\s*[-–]\s*\b(SP|SB|SD|SBV|HSA)\b.*$/i, "");
  name = name.replace(/\s*[-–]\s*$/, "").trim();

  return { product: name || campaignName, asin: null };
}

// ─── GET /ppc/products ─────────────────────────────────────────────────────────
// Aggregates PPC spend/sales by extracted product name across campaigns.
ppcExtraRouter.get("/ppc/products", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range   = getDateRange(filter, from, to);
    const dateFrom = range.gte ?? new Date(Date.now() - 30 * 86400000);
    const dateTo   = range.lte ?? new Date();
    const daysInPeriod = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000));
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;

    const _itzOff = italyOffsetMs();
    const snapDateFrom = new Date(dateFrom.getTime() + _itzOff).toISOString().split("T")[0];
    const snapDateTo   = new Date(dateTo.getTime()   + _itzOff).toISOString().split("T")[0];

    const snapGroups = await groupAdSnapshotsByCampaign(prisma, {
      from: new Date(snapDateFrom),
      to:   new Date(snapDateTo),
      marketplace: mpFilter,
    });

    const nameRows = await findAdSnapshotCampaignNames(prisma, { marketplace: mpFilter });
    const nameMap = new Map<string, string>();
    for (const r of nameRows) nameMap.set(`${r.campaignId}::${r.marketplace}`, r.campaignName);

    const productMap = new Map<string, {
      product: string; asin: string | null;
      spend: number; sales: number; clicks: number; impressions: number; orders: number;
      campaigns: Array<{ campaignId: string; campaignName: string; marketplace: string; spend: number; sales: number; orders: number; acos: number | null }>;
    }>();

    for (const snap of snapGroups) {
      const key          = `${snap.campaignId}::${snap.marketplace}`;
      const campaignName = nameMap.get(key) ?? snap.campaignId;
      const { product, asin } = extractProductInfo(campaignName);
      const spend       = snap._sum?.spend ?? 0;
      const sales       = snap._sum?.sales ?? 0;
      const clicks      = snap._sum?.clicks ?? 0;
      const impressions = snap._sum?.impressions ?? 0;
      const orders      = snap._sum?.orders ?? 0;

      const existing = productMap.get(product);
      const campEntry = {
        campaignId: snap.campaignId,
        campaignName,
        marketplace: snap.marketplace,
        spend,
        sales,
        orders,
        acos: sales > 0 ? Math.round(spend / sales * 10000) / 100 : null,
      };
      if (existing) {
        existing.spend       += spend;
        existing.sales       += sales;
        existing.clicks      += clicks;
        existing.impressions += impressions;
        existing.orders      += orders;
        existing.campaigns.push(campEntry);
      } else {
        productMap.set(product, { product, asin, spend, sales, clicks, impressions, orders, campaigns: [campEntry] });
      }
    }

    const products = Array.from(productMap.values()).map(p => ({
      product:     p.product,
      asin:        p.asin,
      spend:       Math.round(p.spend * 100) / 100,
      sales:       Math.round(p.sales * 100) / 100,
      clicks:      p.clicks,
      impressions: p.impressions,
      orders:      p.orders,
      dailySpend:  Math.round(p.spend / daysInPeriod * 100) / 100,
      acos:        p.sales > 0  ? Math.round(p.spend / p.sales * 10000) / 100 : null,
      roas:        p.spend > 0  ? Math.round(p.sales / p.spend * 100) / 100 : null,
      ctr:         p.impressions > 0 ? Math.round(p.clicks / p.impressions * 10000) / 100 : 0,
      campaignCount: p.campaigns.length,
      campaigns:   p.campaigns.sort((a, b) => b.spend - a.spend),
    }));

    products.sort((a, b) => b.spend - a.spend);

    const totals = {
      spend:   products.reduce((s, p) => s + p.spend, 0),
      sales:   products.reduce((s, p) => s + p.sales, 0),
      orders:  products.reduce((s, p) => s + p.orders, 0),
      products: products.length,
    };

    res.json({ products, totals, daysInPeriod });
  } catch (err) {
    console.error("[Amazon] GET /ppc/products:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ppc/adgroups ─────────────────────────────────────────────────────────
ppcExtraRouter.get("/ppc/adgroups", async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.query as Record<string, string>;
    const mpFilter = marketplace && marketplace !== "all" ? marketplace : undefined;
    const { adGroups } = await getLiveStructure(mpFilter).catch(() => ({ adGroups: [], keywords: [] }));
    res.json({ adGroups, total: adGroups.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /ppc/search-terms ─────────────────────────────────────────────────────
// Returns search term data from DB (persistent) + in-memory cache metadata.
ppcExtraRouter.get("/ppc/search-terms", async (req: Request, res: Response) => {
  try {
    const {
      marketplace, wastedOnly, search, campaignId,
      sortBy = "spend", sortDir = "desc",
      limit = "500", offset = "0",
    } = req.query as Record<string, string>;

    const mpFilter   = marketplace && marketplace !== "all" ? marketplace : undefined;
    const limitN     = Math.min(Number(limit) || 500, 2000);
    const offsetN    = Number(offset) || 0;
    const amazonAccountId = getCurrentAccountId();

    // ── 1. Try in-memory cache first (freshest data) ──────────────────────────
    let rows: any[] = [];
    let generatedAt: number | null = null;
    let dateFrom: string | null    = null;
    let dateTo: string | null      = null;
    let source: "cache" | "db"     = "cache";

    for (const [key, entry] of _stCache.entries()) {
      if (!key.startsWith(`${amazonAccountId}:`)) continue;
      if (mpFilter && entry.marketplace !== mpFilter) continue;
      rows = rows.concat(entry.data);
      if (!generatedAt || entry.generatedAt > generatedAt) {
        generatedAt = entry.generatedAt;
        dateFrom    = entry.dateFrom;
        dateTo      = entry.dateTo;
      }
    }

    // ── 2. Fall back to DB if cache is empty ──────────────────────────────────
    if (rows.length === 0) {
      source = "db";

      const latest = await findLatestAdSearchTermSync(prisma, { marketplace: mpFilter });

      if (latest) {
        dateFrom       = latest.dateFrom;
        dateTo         = latest.dateTo;
        generatedAt    = latest.syncedAt.getTime();

        rows = await findAdSearchTerms(prisma, {
          marketplace: mpFilter,
          campaignId,
          wastedOnly: wastedOnly === "true",
          dateFrom: latest.dateFrom,
          dateTo: latest.dateTo,
          sortBy,
          sortDir: sortDir === "asc" ? "asc" : "desc",
        });
      }
    }

    // ── 3. Apply client-side filters on cache data ────────────────────────────
    if (source === "cache") {
      if (wastedOnly === "true") rows = rows.filter(r => r.isWasted);
      if (campaignId) rows = rows.filter(r => r.campaignId === campaignId);
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(r => r.query.toLowerCase().includes(q) || r.keywordText.toLowerCase().includes(q));
      }
      rows.sort((a, b) => {
        const av = a[sortBy] ?? 0, bv = b[sortBy] ?? 0;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }

    const total = rows.length;
    const paged = rows.slice(offsetN, offsetN + limitN);

    const totals = {
      spend:   rows.reduce((s, r) => s + r.spend, 0),
      sales:   rows.reduce((s, r) => s + r.sales, 0),
      clicks:  rows.reduce((s, r) => s + r.clicks, 0),
      orders:  rows.reduce((s, r) => s + r.orders, 0),
      wasted:  rows.filter(r => r.isWasted).reduce((s, r) => s + r.spend, 0),
      wastedCount: rows.filter(r => r.isWasted).length,
    };

    res.json({
      searchTerms: paged,
      total,
      totals,
      syncing:     _stSyncing,
      generatedAt: generatedAt ? new Date(generatedAt).toISOString() : null,
      dateFrom,
      dateTo,
      source,
    });
  } catch (err) {
    console.error("[Amazon] GET /ppc/search-terms:", err);
    res.status(500).json({ error: String(err) });
  }
});
