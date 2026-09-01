// service.ts — pure business logic for matching a tracked EAN against a
// parsed Redcare/Shop-Apotheke search result. No I/O, no Prisma — the job
// (redcareKeywordTracking.job.ts) supplies the RedcareSearchResult and
// persists the returned WatchCheckResult via the repository layer.
import type { RedcareSearchResult } from "./client";

export interface WatchCheckResult {
  found: boolean;
  position: number | null;
  nbHits: number;
  price: number | null;
  sellerName: string | null;
  productName: string | null;
  promoted: boolean | null;
  promotedByReRanking: boolean | null;
}

export function matchEanInResult(result: RedcareSearchResult, ean: string): WatchCheckResult {
  const hit = result.hits.find((h) => h.ean === ean);
  if (!hit) {
    return {
      found: false, position: null, nbHits: result.nbHits,
      price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null,
    };
  }
  return {
    found: true, position: hit.position, nbHits: result.nbHits,
    price: hit.price, sellerName: hit.sellerName, productName: hit.productName,
    promoted: hit.promoted, promotedByReRanking: hit.promotedByReRanking,
  };
}
