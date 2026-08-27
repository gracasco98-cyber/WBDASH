import { describe, expect, it } from "vitest";
import { toItalyDateColumnValue } from "../../../src/repositories/amazon/ad-spend.repo";

describe("toItalyDateColumnValue", () => {
  it("maps Italy midnight in summer to the same civil SQL date", () => {
    expect(toItalyDateColumnValue(new Date("2026-08-26T22:00:00.000Z")))
      .toEqual(new Date("2026-08-27T00:00:00.000Z"));
  });

  it("maps the end of an Italy-local day to that same civil SQL date", () => {
    expect(toItalyDateColumnValue(new Date("2026-08-27T21:59:59.999Z")))
      .toEqual(new Date("2026-08-27T00:00:00.000Z"));
  });

  it("uses Europe/Rome DST rules in winter", () => {
    expect(toItalyDateColumnValue(new Date("2026-12-14T23:00:00.000Z")))
      .toEqual(new Date("2026-12-15T00:00:00.000Z"));
  });
});
