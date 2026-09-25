import { describe, expect, it } from "vitest";
import { fmtEur, fmtEurNoWrap } from "./MetricRow";

describe("fmtEurNoWrap", () => {
  it("formats like fmtEur but never lets a narrow tile split the euro sign from the amount", () => {
    expect(fmtEurNoWrap(2691.34)).toBe("€ 2691,34");
    expect(fmtEurNoWrap(2691.34).replace(" ", " ")).toBe(fmtEur(2691.34));
  });

  it("keeps negative amounts together too", () => {
    expect(fmtEurNoWrap(-12345.6)).toBe("€ -12.345,60");
  });
});
