import { describe, expect, it } from "vitest";
import {
  channelCogsKey,
  resolveChannelCogsBySku,
} from "../../src/services/channel-cogs.service";
import type { ProductWithIdentifiers } from "../../src/repositories/amazon/product.repo";

const product: ProductWithIdentifiers = {
  id: "product-1",
  name: "VENAVIL",
  brand: null,
  status: "ACTIVE",
  identifiers: [
    {
      id: "identifier-it",
      productId: "product-1",
      channelType: "AMAZON",
      marketplace: "IT",
      asin: "B0VENAVILIT",
      sku: "VENAVIL",
      vatRate: 10,
    },
    {
      id: "identifier-de",
      productId: "product-1",
      channelType: "AMAZON",
      marketplace: "DE",
      asin: "B0VENAVILDE",
      sku: "VENAVIL",
      vatRate: 10,
    },
  ],
};

describe("resolveChannelCogsBySku", () => {
  it("bridges a Redcare SKU to the Amazon ASIN and includes inbound cost", () => {
    const resolved = resolveChannelCogsBySku(
      [{ sku: "VENAVIL", marketplace: "REDCARE_IT" }],
      [product],
      [{ asin: "B0VENAVILIT", marketplace: "ALL", cogsPerUnit: 2.6, shippingCost: 0.4 }],
    );

    expect(resolved.get(channelCogsKey("REDCARE_IT", "VENAVIL"))).toEqual({
      asin: "B0VENAVILIT",
      totalPerUnit: 3,
    });
  });

  it("prefers the matching country identifier and COGS row", () => {
    const resolved = resolveChannelCogsBySku(
      [{ sku: "VENAVIL", marketplace: "REDCARE_DE" }],
      [product],
      [
        { asin: "B0VENAVILIT", marketplace: "ALL", cogsPerUnit: 2.6, shippingCost: 0 },
        { asin: "B0VENAVILDE", marketplace: "ALL", cogsPerUnit: 3.1, shippingCost: 0 },
        { asin: "B0VENAVILDE", marketplace: "DE", cogsPerUnit: 3.5, shippingCost: 0.2 },
      ],
    );

    expect(resolved.get(channelCogsKey("REDCARE_DE", "VENAVIL"))).toEqual({
      asin: "B0VENAVILDE",
      totalPerUnit: 3.7,
    });
  });

  it("does not fabricate a cost when the SKU or COGS record is missing", () => {
    const resolved = resolveChannelCogsBySku(
      [
        { sku: "UNKNOWN", marketplace: "REDCARE_IT" },
        { sku: "VENAVIL", marketplace: "REDCARE_IT" },
      ],
      [product],
      [],
    );

    expect(resolved.size).toBe(0);
  });
});
