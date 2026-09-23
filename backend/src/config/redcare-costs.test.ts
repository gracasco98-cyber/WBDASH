import { describe, expect, it } from "vitest";
import {
  REDCARE_IT_SHIPPING_COST_PER_ORDER,
  calculateRedcareShippingCost,
} from "./redcare-costs";

describe("calculateRedcareShippingCost", () => {
  it("charges 4.36 EUR for each Redcare IT order", () => {
    expect(REDCARE_IT_SHIPPING_COST_PER_ORDER).toBe(4.36);
    expect(calculateRedcareShippingCost(3)).toBeCloseTo(13.08, 2);
  });

  it("never returns a negative shipping cost", () => {
    expect(calculateRedcareShippingCost(0)).toBe(0);
    expect(calculateRedcareShippingCost(-1)).toBe(0);
  });
});
