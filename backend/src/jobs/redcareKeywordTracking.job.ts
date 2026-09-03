// redcareKeywordTracking.job.ts — daily position check for tracked Marketing/
// Redcare keywords (own products + pinned competitors).
import { prisma } from "../db";
import { fetchSearchResults, type RedcareMarket } from "../redcareSearch/client";
import { matchEanInResult } from "../redcareSearch/service";
import { findActiveWatches, createSnapshot } from "../repositories/marketing/redcareWatch.repo";
import { logError } from "../services/shopify.service";

// delayMs paces requests between (market, keyword) groups so the job doesn't
// burst-hit a public storefront — production default is 1s; tests pass 0 to
// keep the suite fast (MSW responses are instant, so no delay is needed there).
export async function runRedcareKeywordTracking(
  delayMs = 1000,
  watchIds?: string[]
): Promise<{ checked: number; errors: number }> {
  let checked = 0;
  let errors = 0;

  const watches = await findActiveWatches(prisma, watchIds ? { ids: watchIds } : undefined);

  // Group by market+keyword so a keyword shared by our product and any
  // pinned competitors triggers exactly one HTTP request to the public
  // search page, not one per watch.
  const byMarketKeyword = new Map<RedcareMarket, Map<string, typeof watches>>();
  for (const w of watches) {
    const market = w.market as RedcareMarket;
    const byKeyword = byMarketKeyword.get(market) ?? new Map<string, typeof watches>();
    byKeyword.set(w.keyword, [...(byKeyword.get(w.keyword) ?? []), w]);
    byMarketKeyword.set(market, byKeyword);
  }

  // Flatten to a single ordered list of groups so we can tell the last one
  // apart and skip the trailing delay after it.
  const groups: { market: RedcareMarket; keyword: string; groupWatches: typeof watches }[] = [];
  for (const [market, byKeyword] of byMarketKeyword) {
    for (const [keyword, groupWatches] of byKeyword) {
      groups.push({ market, keyword, groupWatches });
    }
  }

  for (let i = 0; i < groups.length; i++) {
    const { market, keyword, groupWatches } = groups[i];
    try {
      const result = await fetchSearchResults(market, keyword);
      for (const watch of groupWatches) {
        const match = matchEanInResult(result, watch.ean);
        await createSnapshot(prisma, { watchId: watch.id, ...match });
        checked++;
      }
    } catch (err) {
      errors++;
      await logError("redcare-keyword-tracking", err, { market, keyword });
    }

    // Pace between groups regardless of success/failure — but skip the
    // trailing wait after the last group.
    if (delayMs > 0 && i < groups.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { checked, errors };
}

export function startRedcareKeywordTrackingSchedule(): void {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  const msUntil3am = next3am.getTime() - now.getTime();

  setTimeout(() => {
    runRedcareKeywordTracking().catch((err) => logError("redcare-keyword-tracking-schedule", err));
    setInterval(() => {
      runRedcareKeywordTracking().catch((err) => logError("redcare-keyword-tracking-schedule", err));
    }, 86_400_000);
  }, msUntil3am);

  console.log(`[RedcareKeywordTracking] Daily job scheduled (first run in ${Math.round(msUntil3am / 60000)} min)`);
}
