// amazon/ads-sync.service.ts — Fetch SP campaign daily metrics and store in AmazonAdSnapshot

import { prisma } from "../db";
import { getCurrentAccountId } from "../context/account-context";
import {
  getConfiguredProfiles,
  fetchSPCampaignReport,
  fetchSPKeywordReport,
  fetchSPAdvertisedProductReport,
  listSPCampaigns,
  listSPAdGroups,
  listSPKeywords,
  isAdsConfigured,
  listProfiles,
  SpCampaign,
  SpAdGroup,
  SpKeyword,
} from "./ads-api.service";
import { upsertAdvertisedProductSnapshot } from "../repositories/amazon/ad-spend.repo";
import { filterScheduledAdsProfiles } from "./ads-profile-filter";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ── Live campaign cache (2-min TTL) ──────────────────────────────────────────
interface LiveCampaign extends SpCampaign {
  marketplace: string;
}

// Keyed by amazonAccountId — a plain module-level array here would leak one
// account's campaigns into another account's response (discovered during the
// multi-account migration, see docs/tech-debt.md).
const _liveCampaignCache = new Map<string, { data: LiveCampaign[]; expiresAt: number }>();

/** Fetch all live campaigns from all configured profiles (2-min cache, per account) */
export async function getLiveCampaigns(filterMarketplace?: string): Promise<LiveCampaign[]> {
  const accountId = getCurrentAccountId();
  const cached = _liveCampaignCache.get(accountId);

  // Refresh cache if expired
  if (!cached || Date.now() > cached.expiresAt) {
    if (!(await isAdsConfigured())) return [];
    const profiles = await getConfiguredProfiles();
    const result: LiveCampaign[] = [];
    for (const p of profiles) {
      try {
        const campaigns = await listSPCampaigns(p.profileId);
        for (const c of campaigns) result.push({ ...c, marketplace: p.marketplace });
      } catch (e) {
        console.warn(`[Ads] getLiveCampaigns ${p.marketplace} failed:`, String(e).slice(0, 80));
      }
    }
    _liveCampaignCache.set(accountId, { data: result, expiresAt: Date.now() + 2 * 60_000 });
    console.log(`[Ads] Live campaign cache refreshed for account ${accountId}: ${result.length} campaigns`);
  }

  const data = _liveCampaignCache.get(accountId)!.data;
  if (filterMarketplace && filterMarketplace !== "all") {
    return data.filter((c) => c.marketplace === filterMarketplace);
  }
  return data;
}

/** Force-refresh the live campaign cache for the current account (call from background job) */
export async function refreshLiveCampaignCache(): Promise<void> {
  _liveCampaignCache.delete(getCurrentAccountId());
  await getLiveCampaigns().catch((e) =>
    console.warn("[Ads] Cache refresh failed:", String(e).slice(0, 120))
  );
}

/** Upsert campaign snapshots into DB — handles both single-day and multi-day (DAILY) rows.
 *  Uses findFirst+create/update instead of upsert to avoid Prisma issues with nullable
 *  adGroupId in compound unique keys.
 *
 * Exported for testing (PR 9 lock-in tests).
 */
export async function saveSnapshots(
  marketplace: string,
  defaultDate: string,
  rows: Awaited<ReturnType<typeof fetchSPCampaignReport>>
): Promise<number> {
  let saved = 0;
  const amazonAccountId = getCurrentAccountId();
  for (const row of rows) {
    const rowDate   = row.date ?? defaultDate;
    const snapDate  = new Date(rowDate);
    const acos      = row.sales > 0 ? row.spend / row.sales : null;
    const roas      = row.spend > 0 ? row.sales / row.spend : null;

    // findFirst avoids Prisma's compound-null-unique upsert limitation
    const existing = await (prisma as any).amazonAdSnapshot.findFirst({
      where: {
        amazonAccountId,
        snapshotDate: snapDate,
        marketplace,
        campaignId:   row.campaignId,
        adGroupId:    null,
      },
    });

    if (existing) {
      await (prisma as any).amazonAdSnapshot.update({
        where: { id: existing.id },
        data: {
          campaignName: row.campaignName,
          impressions:  row.impressions,
          clicks:       row.clicks,
          spend:        row.spend,
          sales:        row.sales,
          orders:       row.orders,
          acos,
          roas,
        },
      });
    } else {
      await (prisma as any).amazonAdSnapshot.create({
        data: {
          amazonAccountId,
          snapshotDate: snapDate,
          marketplace,
          campaignId:   row.campaignId,
          campaignName: row.campaignName,
          campaignType: "SP",
          impressions:  row.impressions,
          clicks:       row.clicks,
          spend:        row.spend,
          sales:        row.sales,
          orders:       row.orders,
          acos,
          roas,
        },
      });
    }
    saved++;
  }
  return saved;
}

// ── Per-marketplace sync lock + cooldown after timeout ───────────────────────
const _marketplaceSyncing = new Set<string>();          // keys = "marketplace-startDate"
const _syncCooldown       = new Map<string, number>();  // key → timestamp of last failure
const COOLDOWN_MS         = 30 * 60_000;               // 30 min before retrying a timed-out sync

/** Sync one marketplace for a date range using a single report.
 *  Guards against duplicate concurrent syncs (lock per key) and
 *  implements a 30-min cooldown after a timeout failure so we don't
 *  hammer Amazon with doomed retries.
 */
export async function syncMarketplaceDateRange(
  profileId: string,
  marketplace: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const lockKey = `${marketplace}-${startDate}-${endDate}`;

  // ── Cooldown check ──────────────────────────────────────────────────────────
  const lastFail = _syncCooldown.get(lockKey);
  if (lastFail && Date.now() - lastFail < COOLDOWN_MS) {
    const remainMin = Math.ceil((COOLDOWN_MS - (Date.now() - lastFail)) / 60_000);
    console.log(`[Ads Sync] ${marketplace} ${startDate} in cooldown (${remainMin}min remaining) — skipping`);
    return 0;
  }

  // ── Concurrency lock ────────────────────────────────────────────────────────
  if (_marketplaceSyncing.has(lockKey)) {
    console.log(`[Ads Sync] ${marketplace} ${startDate} already syncing — skipping duplicate`);
    return 0;
  }
  _marketplaceSyncing.add(lockKey);

  console.log(`[Ads Sync] ${marketplace} ${startDate}→${endDate} report...`);
  try {
    const rows = await fetchSPCampaignReport(profileId, startDate, endDate);
    if (!rows.length) {
      console.log(`[Ads Sync] ${marketplace} ${startDate}→${endDate} — no data`);
      return 0;
    }
    const saved = await saveSnapshots(marketplace, startDate, rows);
    console.log(`[Ads Sync] ${marketplace} ${startDate}→${endDate} — saved ${saved} rows`);
    _syncCooldown.delete(lockKey); // success → clear cooldown
    return saved;
  } catch (err) {
    const msg = String(err);
    console.error(`[Ads Sync] Failed ${marketplace} ${startDate}→${endDate}:`, msg.slice(0, 200));
    // Set cooldown only for timeout errors (not auth/network errors worth retrying sooner)
    if (msg.includes("timed out") || msg.includes("PENDING")) {
      _syncCooldown.set(lockKey, Date.now());
      console.log(`[Ads Sync] ${marketplace} ${startDate} cooldown set (30 min)`);
    }
    return 0;
  } finally {
    _marketplaceSyncing.delete(lockKey);
  }
}

/** Sync all configured marketplaces for yesterday (run daily) */
export async function syncAdsDaily(): Promise<void> {
  if (!(await isAdsConfigured())) {
    console.log("[Ads Sync] Advertising API not configured — skipping");
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = dateStr(yesterday);

  const profiles = filterScheduledAdsProfiles(await getConfiguredProfiles());
  console.log(`[Ads Sync] Daily sync for ${date} — ${profiles.length} marketplaces`);

  for (const profile of profiles) {
    await syncMarketplaceDateRange(profile.profileId, profile.marketplace, date, date);
    await sleep(2000);
  }
  console.log("[Ads Sync] Daily sync complete");
}

/**
 * Daily sync for per-ASIN Sponsored Products spend/sales, one report call
 * per configured profile. Persists to AmazonAdvertisedProductSnapshot so
 * request-time reads (products/performance route) never call the Ads API
 * directly — that report can take up to 45 minutes to generate.
 */
export async function syncAdvertisedProductDaily(): Promise<void> {
  if (!(await isAdsConfigured())) {
    console.log("[Ads Sync] Advertising API not configured — skipping advertised-product sync");
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = dateStr(yesterday);

  const profiles = filterScheduledAdsProfiles(await getConfiguredProfiles());
  console.log(`[Ads Sync] Advertised-product daily sync for ${date} — ${profiles.length} marketplaces`);

  for (const profile of profiles) {
    try {
      const rows = await fetchSPAdvertisedProductReport(profile.profileId, date, date);
      for (const row of rows) {
        if (!row.advertisedAsin) continue;
        await upsertAdvertisedProductSnapshot(prisma, {
          snapshotDate: new Date(date),
          marketplace: profile.marketplace,
          asin: row.advertisedAsin,
          campaignId: row.campaignId,
          spend: row.spend,
          sales: row.sales,
          impressions: row.impressions,
          clicks: row.clicks,
          orders: row.orders,
        });
      }
      console.log(`[Ads Sync] ${profile.marketplace} advertised-product — saved ${rows.length} rows`);
      await sleep(2000);
    } catch (err) {
      console.error(`[Ads Sync] ${profile.marketplace} advertised-product sync failed:`, err);
    }
  }
  console.log("[Ads Sync] Advertised-product daily sync complete");
}

/**
 * Backfill N days using monthly report batches.
 * One report per month per marketplace = ~4 reports for 120 days
 * vs 120 reports for the day-by-day approach.
 */
export async function syncAdsBackfill(days = 30): Promise<void> {
  if (!(await isAdsConfigured())) {
    console.log("[Ads Sync] Advertising API not configured — skipping backfill");
    return;
  }

  const profiles = await getConfiguredProfiles();
  const today = new Date();
  const startFrom = new Date(today);
  startFrom.setDate(startFrom.getDate() - days);

  // Build monthly chunks
  const chunks: Array<{ start: string; end: string }> = [];
  let cur = new Date(startFrom);
  while (cur <= today) {
    const chunkStart = dateStr(cur);
    const endOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const chunkEnd = dateStr(endOfMonth < today ? endOfMonth : today);
    chunks.push({ start: chunkStart, end: chunkEnd });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  console.log(`[Ads Sync] Backfill ${days} days — ${chunks.length} monthly chunks × ${profiles.length} marketplaces`);

  for (const profile of profiles) {
    for (const chunk of chunks) {
      await syncMarketplaceDateRange(profile.profileId, profile.marketplace, chunk.start, chunk.end);
      await sleep(3000);
    }
  }
  console.log("[Ads Sync] Backfill complete");
}

/** Sync any missing days between last snapshot date and yesterday */
export async function syncAdsCatchUp(): Promise<void> {
  if (!(await isAdsConfigured())) return;
  const profiles = await getConfiguredProfiles();

  // Find latest snapshot date in DB (scoped to the current account)
  const latest = await prisma.$queryRawUnsafe<{ d: string }[]>(
    `SELECT MAX("snapshotDate")::text AS d FROM "AmazonAdSnapshot" WHERE "amazonAccountId" = '${getCurrentAccountId()}'`
  );
  const latestDate = latest[0]?.d;
  if (!latestDate) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dateStr(yesterday);

  if (latestDate >= yesterdayStr) {
    console.log(`[Ads CatchUp] Data is current (latest: ${latestDate})`);
    return;
  }

  // Sync from day after latest up to yesterday
  const fromDate = new Date(latestDate);
  fromDate.setDate(fromDate.getDate() + 1);
  const fromStr = dateStr(fromDate);

  console.log(`[Ads CatchUp] Missing data from ${fromStr} to ${yesterdayStr} — syncing...`);
  for (const profile of profiles) {
    await syncMarketplaceDateRange(profile.profileId, profile.marketplace, fromStr, yesterdayStr);
    await sleep(2000);
  }
  console.log(`[Ads CatchUp] Done`);
}

/** Verify connection: fetch profiles from Amazon and return them */
export async function verifyAdsConnection(): Promise<{ ok: boolean; profiles: any[]; error?: string }> {
  try {
    const profiles = await listProfiles();
    return { ok: true, profiles };
  } catch (err) {
    return { ok: false, profiles: [], error: String(err) };
  }
}

/** Get a quick campaign list (no reports — instant) for a marketplace */
export async function quickCampaignList(marketplace: string): Promise<any[]> {
  const { getProfileId } = await import("./ads-api.service");
  const profileId = await getProfileId(marketplace);
  return listSPCampaigns(profileId);
}

// ── Live keyword cache (5-min TTL) ────────────────────────────────────────────
interface CachedStructure {
  keywords:  (SpKeyword  & { marketplace: string })[];
  adGroups:  (SpAdGroup  & { marketplace: string })[];
  expiresAt: number;
}
// Keyed by amazonAccountId — see _liveCampaignCache above for why.
const _structureCache = new Map<string, CachedStructure>();

/** Fetch all ad groups + keywords from all configured profiles (5-min cache, per account) */
export async function getLiveStructure(filterMarketplace?: string): Promise<{
  adGroups: (SpAdGroup & { marketplace: string })[];
  keywords: (SpKeyword & { marketplace: string })[];
}> {
  const accountId = getCurrentAccountId();
  const cached = _structureCache.get(accountId);

  if (!cached || Date.now() > cached.expiresAt) {
    if (!(await isAdsConfigured())) return { adGroups: [], keywords: [] };
    const profiles = await getConfiguredProfiles();
    const adGroups: (SpAdGroup & { marketplace: string })[] = [];
    const keywords: (SpKeyword & { marketplace: string })[] = [];

    for (const p of profiles) {
      try {
        const ag = await listSPAdGroups(p.profileId);
        for (const g of ag) adGroups.push({ ...g, marketplace: p.marketplace });
        await sleep(500);
        const kw = await listSPKeywords(p.profileId);
        for (const k of kw) keywords.push({ ...k, marketplace: p.marketplace });
        console.log(`[Ads Structure] ${p.marketplace}: ${ag.length} adGroups, ${kw.length} keywords`);
      } catch (e) {
        console.warn(`[Ads Structure] ${p.marketplace} failed:`, String(e).slice(0, 100));
      }
      await sleep(500);
    }

    _structureCache.set(accountId, { adGroups, keywords, expiresAt: Date.now() + 5 * 60_000 });
    console.log(`[Ads Structure] Cache for account ${accountId}: ${adGroups.length} adGroups, ${keywords.length} keywords`);
  }

  const { adGroups, keywords } = _structureCache.get(accountId)!;
  if (filterMarketplace && filterMarketplace !== "all") {
    return {
      adGroups: adGroups.filter((g) => g.marketplace === filterMarketplace),
      keywords: keywords.filter((k) => k.marketplace === filterMarketplace),
    };
  }
  return { adGroups, keywords };
}

/** Sync keyword metrics for all configured profiles */
export async function syncKeywordMetrics(days = 30): Promise<void> {
  if (!(await isAdsConfigured())) return;
  const profiles = await getConfiguredProfiles();
  const amazonAccountId = getCurrentAccountId();
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - days);
  const startDate = dateStr(start);
  const endDate   = dateStr(new Date(today.getTime() - 86400000));

  for (const p of profiles) {
    try {
      console.log(`[Ads KW] Syncing ${p.marketplace} keywords ${startDate}→${endDate}`);

      // Try to get adGroup→campaign mapping (live API, 30s timeout baked into adsRequest)
      let adGroupMap = new Map<string, string>(); // adGroupId → campaignId
      try {
        const adGroups = await listSPAdGroups(p.profileId);
        for (const ag of adGroups) adGroupMap.set(ag.adGroupId, ag.campaignId);
        console.log(`[Ads KW] ${p.marketplace}: got ${adGroups.length} adGroups for campaign mapping`);
      } catch (e) {
        console.warn(`[Ads KW] ${p.marketplace}: adGroup mapping failed (will save without campaignId):`, String(e).slice(0, 120));
      }

      const rows = await fetchSPKeywordReport(p.profileId, startDate, endDate);
      let saved = 0;
      // SUMMARY report: all rows are aggregated over the period, use endDate as snapshotDate
      const snapDate = new Date(endDate);
      for (const row of rows) {
        const acos = row.sales > 0 ? row.spend / row.sales : null;
        // Use adGroupMap to resolve campaignId if not in the report
        const campaignId = row.campaignId || adGroupMap.get(row.adGroupId) || "";
        // Use findFirst + create/update to avoid compound-key issues
        const existing = await (prisma as any).amazonAdKeywordSnapshot.findFirst({
          where: {
            amazonAccountId,
            snapshotDate: snapDate,
            marketplace:  p.marketplace,
            keywordId:    row.keywordId,
          },
        });
        if (existing) {
          await (prisma as any).amazonAdKeywordSnapshot.update({
            where: { id: existing.id },
            data: {
              campaignId:   campaignId,
              adGroupId:    row.adGroupId,
              keywordText:  row.keywordText,
              matchType:    row.matchType,
              impressions:  row.impressions,
              clicks:       row.clicks,
              spend:        row.spend,
              sales:        row.sales,
              orders:       row.orders,
              acos,
            },
          });
        } else {
          await (prisma as any).amazonAdKeywordSnapshot.create({
            data: {
              amazonAccountId,
              snapshotDate: snapDate,
              marketplace:  p.marketplace,
              campaignId:   campaignId,
              adGroupId:    row.adGroupId,
              keywordId:    row.keywordId,
              keywordText:  row.keywordText,
              matchType:    row.matchType,
              impressions:  row.impressions,
              clicks:       row.clicks,
              spend:        row.spend,
              sales:        row.sales,
              orders:       row.orders,
              acos,
            },
          });
        }
        saved++;
      }
      console.log(`[Ads KW] ${p.marketplace}: saved ${saved} keyword rows`);
    } catch (e) {
      console.error(`[Ads KW] ${p.marketplace} failed:`, String(e).slice(0, 200));
    }
    await sleep(3000);
  }
}
