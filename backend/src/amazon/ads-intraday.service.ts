// amazon/ads-intraday.service.ts — Refresh today's Ads metrics for the dashboard.

import { prisma } from "../db";
import { upsertAdvertisedProductSnapshot } from "../repositories/amazon/ad-spend.repo";
import {
  fetchSPAdvertisedProductReport,
  getConfiguredProfiles,
  isAdsConfigured,
} from "./ads-api.service";
import { filterScheduledAdsProfiles } from "./ads-profile-filter";
import { syncMarketplaceDateRange } from "./ads-sync.service";
import { italyDateString } from "./utils/datetime";

/** Refresh today's campaign and per-ASIN metrics for scheduled marketplaces. */
export async function syncAdsIntraday(now = new Date()): Promise<void> {
  if (!(await isAdsConfigured())) {
    console.log("[Ads Sync] Advertising API not configured — skipping intraday sync");
    return;
  }

  const date = italyDateString(now);
  const profiles = filterScheduledAdsProfiles(await getConfiguredProfiles());
  console.log(`[Ads Sync] Intraday sync for ${date} — ${profiles.length} marketplaces`);

  for (const profile of profiles) {
    await syncMarketplaceDateRange(profile.profileId, profile.marketplace, date, date);

    try {
      const rows = await fetchSPAdvertisedProductReport(profile.profileId, date, date);
      for (const row of rows) {
        if (!row.advertisedAsin) continue;
        await upsertAdvertisedProductSnapshot(prisma, {
          snapshotDate: new Date(`${date}T00:00:00.000Z`),
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
      console.log(`[Ads Sync] ${profile.marketplace} advertised-product intraday — saved ${rows.length} rows`);
    } catch (err) {
      console.error(`[Ads Sync] ${profile.marketplace} advertised-product intraday failed:`, err);
    }
  }
  console.log("[Ads Sync] Intraday sync complete");
}
