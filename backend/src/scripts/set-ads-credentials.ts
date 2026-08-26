// set-ads-credentials.ts — One-off: attach real Advertising API credentials
// to an existing AmazonAccount (found by sellerId), then immediately verify
// them with a live GET /v2/profiles call. Companion to the local
// amazon-ads-auth.js OAuth helper (repo root), which prints the exact
// command to run this with.
// Run via: railway run npm run --prefix backend set-ads-credentials -- \
//   --sellerId='A1UX7E7RRSY5UK' --clientId='...' --clientSecret='...' \
//   --refreshToken='...' --profileIds='{"IT":"123"}'
import { prisma } from "../db";
import { findActiveAccounts, updateAdsCredentials } from "../repositories/amazon/accounts.repo";
import { runWithAccount } from "../context/account-context";
import { listProfiles } from "../amazon/ads-api.service";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=([\s\S]*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { sellerId, clientId, clientSecret, refreshToken, profileIds } = args;

  if (!sellerId || !clientId || !clientSecret || !refreshToken) {
    console.error(
      "Usage: set-ads-credentials --sellerId=... --clientId=... --clientSecret=... --refreshToken=... [--profileIds='{\"IT\":\"123\"}']"
    );
    process.exit(1);
  }

  const accounts = await findActiveAccounts(prisma);
  const account = accounts.find((a) => a.sellerId === sellerId);
  if (!account) {
    console.error(`No active AmazonAccount found with sellerId ${sellerId}`);
    process.exit(1);
  }

  const parsedProfileIds = profileIds ? JSON.parse(profileIds) : {};

  await updateAdsCredentials(prisma, account.id, {
    adsClientId: clientId,
    adsClientSecret: clientSecret,
    adsRefreshToken: refreshToken,
    adsProfileIds: parsedProfileIds,
  });

  console.log(
    `[set-ads-credentials] Saved Ads credentials for "${account.name}" (${account.id}), ` +
    `${Object.keys(parsedProfileIds).length} profile(s) configured.`
  );

  console.log("[set-ads-credentials] Verifying with a live GET /v2/profiles call...");
  await runWithAccount(account.id, async () => {
    const liveProfiles = await listProfiles();
    console.log(`[set-ads-credentials] Live verification OK — Amazon returned ${liveProfiles.length} profile(s):`);
    console.log(liveProfiles.map((p) => `  ${p.marketplace}: profileId=${p.profileId}`).join("\n"));
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[set-ads-credentials] Failed:", err);
  process.exit(1);
});
