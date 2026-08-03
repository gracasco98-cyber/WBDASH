import { describe, it, expect } from "vitest";
import { mergeOrders } from "./mergeOrders";

describe("mergeOrders", () => {
  it("normalizes and merges Amazon + Shopify orders sorted by date descending", () => {
    const amazonOrders = [
      { amazonOrderId: "AMZ-1", purchaseDate: "2026-08-01T10:00:00.000Z", itemTotal: 50, currency: "EUR", orderStatus: "Shipped", marketplace: "IT" },
    ];
    const shopifyOrders = [
      { id: "shop-1", createdAt: "2026-08-02T10:00:00.000Z", totalAmount: 30, currency: "EUR", financialStatus: "paid", marketplaceDetected: "TEMU_IT" },
    ];

    const result = mergeOrders(amazonOrders, shopifyOrders);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "shop-1", channel: "shopify", total: 30, status: "paid", marketplace: "TEMU_IT" });
    expect(result[1]).toMatchObject({ id: "AMZ-1", channel: "amazon", total: 50, status: "Shipped", marketplace: "IT" });
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(mergeOrders([], [])).toEqual([]);
  });
});
