// seed-amazon-account.ts — Bootstrap the initial AmazonAccount from the
// legacy single-account env vars (AMAZON_LWA_CLIENT_ID, AMAZON_EU_REFRESH_TOKEN,
// AMAZON_ADVERTISING_*), so existing single-account deployments keep working
// after the multi-account migration without any manual step.
// Run automatically by entrypoint.sh on every start (idempotent).
// Can also be run manually: npm run seed:amazon-account
import { prisma } from "./db";
import { createAccount, findActiveAccounts } from "./repositories/amazon/accounts.repo";

async function seedAmazonAccount(): Promise<void> {
  const sellerId = process.env.AMAZON_SELLER_ID?.trim();
  const refreshToken = process.env.AMAZON_EU_REFRESH_TOKEN?.trim();

  if (!sellerId || !refreshToken) {
    console.warn(
      "[seed-amazon-account] AMAZON_SELLER_ID or AMAZON_EU_REFRESH_TOKEN not set — " +
        "skipping. Create an account via POST /api/amazon/accounts once credentials are available."
    );
    await prisma.$disconnect();
    return;
  }

  const existing = await findActiveAccounts(prisma);
  if (existing.some((a) => a.sellerId === sellerId)) {
    console.log(`[seed-amazon-account] Account for seller ${sellerId} already exists — skipping.`);
    await prisma.$disconnect();
    return;
  }

  const adsProfileIds: Record<string, string> = {};
  for (const mp of ["IT", "DE", "FR", "ES", "UK", "NL", "BE", "SE", "PL"]) {
    const val = process.env[`AMAZON_ADVERTISING_PROFILE_${mp}`];
    if (val) adsProfileIds[mp] = val;
  }

  const account = await createAccount(prisma, {
    name: process.env.AMAZON_ACCOUNT_NAME?.trim() || "Main EU account",
    sellerId,
    region: "EU",
    lwaClientId: process.env.AMAZON_LWA_CLIENT_ID ?? null,
    lwaClientSecret: process.env.AMAZON_LWA_CLIENT_SECRET ?? null,
    spApiRefreshToken: refreshToken,
    spApiRefreshTokenNA: process.env.AMAZON_US_REFRESH_TOKEN ?? null,
    adsClientId: process.env.AMAZON_ADVERTISING_CLIENT_ID ?? process.env.AMAZON_LWA_CLIENT_ID ?? null,
    adsClientSecret:
      process.env.AMAZON_ADVERTISING_CLIENT_SECRET ?? process.env.AMAZON_LWA_CLIENT_SECRET ?? null,
    adsRefreshToken: process.env.AMAZON_ADVERTISING_REFRESH_TOKEN ?? refreshToken,
    adsProfileIds,
  });

  console.log(`[seed-amazon-account] Created AmazonAccount "${account.name}" (${account.id}) for seller ${sellerId}.`);
  await prisma.$disconnect();
}

seedAmazonAccount().catch((err) => {
  console.error("[seed-amazon-account] Failed:", err);
  process.exit(1);
});
