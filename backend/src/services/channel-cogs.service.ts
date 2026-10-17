import type { ProductWithIdentifiers } from "../repositories/amazon/product.repo";

export interface ChannelSkuRequest {
  sku: string;
  marketplace: string;
}

export interface CogsCandidate {
  asin: string;
  marketplace: string;
  cogsPerUnit: number;
  shippingCost: number;
}

export interface ResolvedChannelCogs {
  asin: string;
  totalPerUnit: number;
}

const keyOf = (marketplace: string, sku: string) =>
  `${marketplace}::${sku.trim().toUpperCase()}`;

function amazonMarketplaceFor(channelMarketplace: string): string {
  if (channelMarketplace.startsWith("REDCARE_")) {
    return channelMarketplace.slice("REDCARE_".length);
  }
  return channelMarketplace;
}

/**
 * Resolves channel SKUs (currently Redcare) to the existing Amazon COGS
 * records through Product/ProductIdentifier. A country-specific identifier
 * and COGS row wins; `ALL` remains the standard fallback.
 */
export function resolveChannelCogsBySku(
  requests: ChannelSkuRequest[],
  products: ProductWithIdentifiers[],
  cogsRows: CogsCandidate[],
): Map<string, ResolvedChannelCogs> {
  const result = new Map<string, ResolvedChannelCogs>();

  for (const request of requests) {
    const normalizedSku = request.sku.trim().toUpperCase();
    const product = products.find((candidate) =>
      candidate.identifiers.some(
        (identifier) => identifier.sku?.trim().toUpperCase() === normalizedSku,
      ),
    );
    if (!product) continue;

    const targetMarketplace = amazonMarketplaceFor(request.marketplace);
    const amazonIdentifiers = product.identifiers.filter(
      (identifier) => identifier.channelType === "AMAZON" && identifier.asin,
    );
    const identifier =
      amazonIdentifiers.find((candidate) => candidate.marketplace === targetMarketplace) ??
      amazonIdentifiers.find(
        (candidate) => candidate.sku?.trim().toUpperCase() === normalizedSku,
      ) ??
      amazonIdentifiers[0];
    if (!identifier?.asin) continue;

    const asinRows = cogsRows.filter((row) => row.asin === identifier.asin);
    const cogs =
      asinRows.find((row) => row.marketplace === targetMarketplace) ??
      asinRows.find((row) => row.marketplace === "ALL") ??
      asinRows.find((row) => row.marketplace === identifier.marketplace) ??
      asinRows[0];
    if (!cogs) continue;

    result.set(keyOf(request.marketplace, request.sku), {
      asin: identifier.asin,
      totalPerUnit: Number(cogs.cogsPerUnit) + Number(cogs.shippingCost),
    });
  }

  return result;
}

export function channelCogsKey(marketplace: string, sku: string): string {
  return keyOf(marketplace, sku);
}
