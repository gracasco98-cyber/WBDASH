export const REDCARE_IT_SHIPPING_COST_PER_ORDER = 4.36;

export function calculateRedcareShippingCost(orderCount: number): number {
  return Math.max(0, orderCount) * REDCARE_IT_SHIPPING_COST_PER_ORDER;
}
