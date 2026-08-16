import { describe, it, expect } from "vitest";
import { isValidTransition, allowedNextStatuses } from "../../src/purchasing/purchase-order-state-machine";

describe("purchase-order-state-machine — FASE E1 receiving transitions", () => {
  it("allows CONFIRMED/IN_PRODUCTION/READY/PARTIALLY_SHIPPED/SHIPPED to reach PARTIALLY_RECEIVED", () => {
    for (const from of ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED"] as const) {
      expect(isValidTransition(from, "PARTIALLY_RECEIVED")).toBe(true);
    }
  });

  it("allows CONFIRMED/IN_PRODUCTION/READY/PARTIALLY_SHIPPED/SHIPPED to reach RECEIVED directly", () => {
    for (const from of ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED"] as const) {
      expect(isValidTransition(from, "RECEIVED")).toBe(true);
    }
  });

  it("allows PARTIALLY_RECEIVED to reach RECEIVED", () => {
    expect(isValidTransition("PARTIALLY_RECEIVED", "RECEIVED")).toBe(true);
  });

  it("still rejects transitions into RECEIVED/PARTIALLY_RECEIVED from DRAFT/SENT/CANCELLED/COMPLETED", () => {
    for (const from of ["DRAFT", "SENT", "CANCELLED", "COMPLETED"] as const) {
      expect(isValidTransition(from, "RECEIVED")).toBe(false);
      expect(isValidTransition(from, "PARTIALLY_RECEIVED")).toBe(false);
    }
  });

  it("PARTIALLY_RECEIVED and RECEIVED still have no outbound CANCELLED (goods already arrived)", () => {
    expect(allowedNextStatuses("PARTIALLY_RECEIVED")).not.toContain("CANCELLED");
    expect(allowedNextStatuses("RECEIVED")).toEqual([]);
  });
});
