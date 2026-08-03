export interface UnifiedOrder {
  id: string;
  channel: "amazon" | "shopify";
  date: string;
  total: number;
  currency: string;
  status: string;
  marketplace: string;
}

export function mergeOrders(amazonOrders: any[], shopifyOrders: any[]): UnifiedOrder[] {
  const fromAmazon: UnifiedOrder[] = amazonOrders.map(o => ({
    id: o.amazonOrderId,
    channel: "amazon",
    date: o.purchaseDate,
    total: Number(o.itemTotal),
    currency: o.currency ?? "EUR",
    status: o.orderStatus,
    marketplace: o.marketplace,
  }));
  const fromShopify: UnifiedOrder[] = shopifyOrders.map(o => ({
    id: o.id,
    channel: "shopify",
    date: o.createdAt,
    total: Number(o.totalAmount),
    currency: o.currency ?? "EUR",
    status: o.financialStatus,
    marketplace: o.marketplaceDetected,
  }));
  return [...fromAmazon, ...fromShopify].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
