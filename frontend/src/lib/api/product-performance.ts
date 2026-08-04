// lib/api/product-performance.ts — /products/performance + manual grouping endpoints
import { apiUrl, get } from "./client";
import type { ProductPerformanceResponse } from "./types";

export const productPerformance = {
  get: (params: { marketplace: string; from: string; to: string; productIds?: string }) =>
    get<ProductPerformanceResponse>("/api/amazon/products/performance", params),

  rename: async (productId: string, name: string): Promise<void> => {
    const res = await fetch(apiUrl(`/api/amazon/products/${productId}`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
  },

  moveIdentifier: async (identifierId: string, targetProductId: string): Promise<void> => {
    const res = await fetch(apiUrl(`/api/amazon/products/identifiers/${identifierId}`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProductId }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
  },
};
