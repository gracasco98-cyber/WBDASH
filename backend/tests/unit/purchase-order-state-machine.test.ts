import { describe, it, expect } from "vitest";
import { isValidTransition, allowedNextStatuses } from "../../src/purchasing/purchase-order-state-machine";

describe("purchase-order-state-machine", () => {
  it("allows each step of the linear happy path", () => {
    expect(isValidTransition("DRAFT", "SENT")).toBe(true);
    expect(isValidTransition("SENT", "CONFIRMED")).toBe(true);
    expect(isValidTransition("CONFIRMED", "IN_PRODUCTION")).toBe(true);
    expect(isValidTransition("IN_PRODUCTION", "READY")).toBe(true);
    expect(isValidTransition("READY", "PARTIALLY_SHIPPED")).toBe(true);
    expect(isValidTransition("PARTIALLY_SHIPPED", "SHIPPED")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(isValidTransition("DRAFT", "CONFIRMED")).toBe(false);
    expect(isValidTransition("READY", "SHIPPED")).toBe(false);
  });

  it("rejects moving backwards", () => {
    expect(isValidTransition("SENT", "DRAFT")).toBe(false);
  });

  it("allows CANCELLED from any pre-COMPLETED state", () => {
    const preCompleted = ["DRAFT", "SENT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED"] as const;
    for (const s of preCompleted) {
      expect(isValidTransition(s, "CANCELLED")).toBe(true);
    }
  });

  it("rejects any transition out of CANCELLED", () => {
    expect(allowedNextStatuses("CANCELLED")).toEqual([]);
  });

  it("allows the receiving states reachable since FASE E1, keeps COMPLETED unreachable", () => {
    expect(isValidTransition("SHIPPED", "PARTIALLY_RECEIVED")).toBe(true);
    expect(allowedNextStatuses("PARTIALLY_RECEIVED")).toEqual(["RECEIVED"]);
    expect(allowedNextStatuses("RECEIVED")).toEqual([]);
    expect(allowedNextStatuses("COMPLETED")).toEqual([]);
  });
});
