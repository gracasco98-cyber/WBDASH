import type { AdsProfileInfo } from "./ads-api.service";

/** Apply the optional marketplace allow-list to automatic Ads jobs. */
export function filterScheduledAdsProfiles(profiles: AdsProfileInfo[]): AdsProfileInfo[] {
  const configured = process.env.AMAZON_ADS_SYNC_MARKETPLACES;
  if (!configured?.trim()) return profiles;

  const enabled = new Set(
    configured.split(",").map((marketplace) => marketplace.trim().toUpperCase()).filter(Boolean)
  );
  const filtered = profiles.filter((profile) => enabled.has(profile.marketplace.toUpperCase()));
  if (filtered.length === 0) {
    console.warn(`[Ads Sync] No profiles match AMAZON_ADS_SYNC_MARKETPLACES=${configured}`);
  }
  return filtered;
}
