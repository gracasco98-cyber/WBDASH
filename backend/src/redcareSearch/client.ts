// client.ts — Redcare/Shop-Apotheke public search page reader.
// Standalone: no dependency on backend/src/mirakl/** or any other domain.
//
// Both storefronts (redcare.it for IT, shop-apotheke.com for DE) render their
// search results page server-side and embed the underlying Algolia
// InstantSearch.js response, unmodified, as a plain JSON assignment:
//
//   <script>window[Symbol.for("InstantSearchInitialResults")] = { "<index>": { "results": [...] } }</script>
//
// This is public, unauthenticated, standard Algolia InstantSearch SSR
// hydration — not a documented API, so a future redesign of either site can
// change or remove it without notice. Every failure mode below throws an
// explicit, descriptive error instead of returning an empty/partial result,
// so a shape change surfaces immediately in the daily job's error log
// instead of silently writing wrong history.

export type RedcareMarket = "IT" | "DE";

export interface RedcareSearchHit {
  position: number; // 1-based, order as returned by Algolia
  ean: string | null;
  productName: string | null;
  price: number | null; // euro (converted from the raw cents value)
  sellerName: string | null;
  sellerType: string | null; // e.g. "MIRAKL" for offers placed through Mirakl
  promoted: boolean | null; // Algolia AI ReRanking signal — NOT "paid ad"
  promotedByReRanking: boolean | null;
  // Market-opportunity fields — real, present on the live hit, but only for
  // the CURRENT keyword search: they are never persisted to a snapshot (the
  // daily job only stores position/price/seller, see redcareWatch.repo.ts),
  // so they exist solely for the live "Cerebro" search view, not history.
  brand: string | null;
  rating: number | null; // averageRating, 0-5
  ratingCount: number | null;
  inStock: boolean | null;
  category: string | null; // mainCategory lvl1>lvl2>lvl3 joined, lvl0 (site name) dropped
  sellerCount: number | null; // distinct sellers competing for this exact listing
}

export interface RedcareSearchResult {
  market: RedcareMarket;
  keyword: string;
  nbHits: number;
  hits: RedcareSearchHit[];
}

interface MarketConfig {
  domain: string;
  indexName: string;
}

const MARKET_CONFIG: Record<RedcareMarket, MarketConfig> = {
  IT: { domain: "https://www.redcare.it", indexName: "products_mktplc_prod_IT_it" },
  DE: { domain: "https://www.shop-apotheke.com", indexName: "products_mktplc_prod_DE_de" },
};

const BLOB_MARKER = 'window[Symbol.for("InstantSearchInitialResults")] = ';

function joinCategory(mainCategory: any): string | null {
  if (!mainCategory || typeof mainCategory !== "object") return null;
  // lvl0 is always the site name (e.g. "redcare.it") — not a real category level.
  const levels = [mainCategory.lvl1, mainCategory.lvl2, mainCategory.lvl3].filter(
    (l): l is string => typeof l === "string" && l.length > 0
  );
  return levels.length ? levels.join(" > ") : null;
}

function extractHit(raw: any, position: number): RedcareSearchHit {
  return {
    position,
    ean: raw.ean ?? null,
    productName: raw.productName ?? null,
    price: typeof raw.price === "number" ? raw.price / 100 : null,
    sellerName: raw.best_offer?.seller?.name ?? null,
    sellerType: raw.best_offer?.type ?? null,
    promoted: raw._rankingInfo?.promoted ?? null,
    promotedByReRanking: raw._rankingInfo?.promotedByReRanking ?? null,
    brand: raw.brand ?? null,
    rating: typeof raw.averageRating === "number" ? raw.averageRating : null,
    ratingCount: typeof raw.ratingCount === "number" ? raw.ratingCount : null,
    inStock: typeof raw.inStock === "boolean" ? raw.inStock : null,
    category: joinCategory(raw.mainCategory),
    sellerCount: typeof raw.seller_count === "number" ? raw.seller_count : null,
  };
}

export async function fetchSearchResults(market: RedcareMarket, keyword: string): Promise<RedcareSearchResult> {
  const config = MARKET_CONFIG[market];
  const url = `${config.domain}/search.htm?q=${encodeURIComponent(keyword)}&searchChannel=algolia`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WBDASH-KeywordTracker/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Redcare search HTTP error ${res.status} (market=${market}, keyword="${keyword}")`);
  }

  const html = await res.text();
  const markerIndex = html.indexOf(BLOB_MARKER);
  if (markerIndex === -1) {
    throw new Error(
      `InstantSearchInitialResults blob not found in the ${market} search page — page structure may have changed (keyword="${keyword}")`
    );
  }

  const jsonStart = markerIndex + BLOB_MARKER.length;
  const scriptEnd = html.indexOf("</script>", jsonStart);
  if (scriptEnd === -1) {
    throw new Error(`Could not find closing </script> after InstantSearchInitialResults blob (market=${market})`);
  }

  const rawJson = html.slice(jsonStart, scriptEnd).trim().replace(/;$/, "");

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to JSON.parse InstantSearchInitialResults blob (market=${market}): ${msg}`);
  }

  const indexData = parsed[config.indexName];
  const result = indexData?.results?.[0];
  if (!result || !Array.isArray(result.hits)) {
    throw new Error(
      `Unexpected InstantSearchInitialResults shape for index "${config.indexName}" (market=${market}) — expected results[0].hits`
    );
  }

  return {
    market,
    keyword,
    nbHits: typeof result.nbHits === "number" ? result.nbHits : result.hits.length,
    hits: result.hits.map((h: any, i: number) => extractHit(h, i + 1)),
  };
}
