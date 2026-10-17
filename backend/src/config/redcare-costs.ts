export const REDCARE_IT_SHIPPING_COST_PER_ORDER = 4.36;

export function calculateRedcareShippingCost(orderCount: number): number {
  return Math.max(0, orderCount) * REDCARE_IT_SHIPPING_COST_PER_ORDER;
}

/** Operational sales VAT rate applied to Redcare turnover. */
export const REDCARE_VAT_RATE = 10;
export const REDCARE_FEE_RATE = 0.15;

/** VAT contained in a VAT-inclusive amount: €110 at 10% holds €10, not €11. */
export function extractVat(grossInclVat: number, ratePct: number): number {
  return Math.max(0, grossInclVat) * ratePct / (100 + ratePct);
}

/**
 * Redcare costs and the dashboard net margin. `net` is the Shopify order net
 * (turnover minus refunds); the margin is what stays in pocket after fees,
 * shipping, Ads, the VAT owed on sales and COGS.
 */
export function calculateRedcareKpis(input: {
  gross: number; refunds: number; net: number; adSpend: number; orderCount: number; cogs: number;
}) {
  const taxable = Math.max(0, input.gross - input.refunds);
  const redcareVat = extractVat(taxable, REDCARE_VAT_RATE);
  const redcareFee = taxable * REDCARE_FEE_RATE;
  const redcareShippingCost = calculateRedcareShippingCost(input.orderCount);
  const totalNet = input.net - input.adSpend - redcareVat - redcareFee - redcareShippingCost - input.cogs;
  return { redcareVat, redcareFee, redcareShippingCost, redcareCogs: input.cogs, totalNet };
}
