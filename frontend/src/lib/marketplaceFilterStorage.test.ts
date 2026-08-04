import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStoredMarketplace,
  setStoredMarketplace,
  onMarketplaceChange,
} from "./marketplaceFilterStorage";

describe("marketplaceFilterStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'all' when nothing is stored", () => {
    expect(getStoredMarketplace()).toBe("all");
  });

  it("persists and reads back a stored value", () => {
    setStoredMarketplace("AMAZON_IT");
    expect(getStoredMarketplace()).toBe("AMAZON_IT");
  });

  it("resets to 'all' when set back to 'all'", () => {
    setStoredMarketplace("AMAZON_IT");
    setStoredMarketplace("all");
    expect(getStoredMarketplace()).toBe("all");
  });

  it("notifies subscribers when the value changes", () => {
    const cb = vi.fn();
    const unsubscribe = onMarketplaceChange(cb);
    setStoredMarketplace("TEMU_ES");
    expect(cb).toHaveBeenCalledWith("TEMU_ES");
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const cb = vi.fn();
    const unsubscribe = onMarketplaceChange(cb);
    unsubscribe();
    setStoredMarketplace("EBAY");
    expect(cb).not.toHaveBeenCalled();
  });
});
