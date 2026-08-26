import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDateRange, italyDayStart } from "../../src/amazon/utils/datetime";

describe("getDateRange — Italy timezone boundaries", () => {
  beforeEach(() => {
    // 2026-08-26T12:00:00Z = 14:00 in Italia (CEST, agosto = UTC+2).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("'today' starts at Italy midnight (22:00 UTC the previous day in CEST), not server/UTC midnight", () => {
    const { gte, lte } = getDateRange("today");
    expect(gte).toEqual(new Date("2026-08-25T22:00:00.000Z"));
    expect(lte).toEqual(new Date("2026-08-26T21:59:59.999Z"));
  });

  it("LOCK-IN (bug reproduced 2026-08-26 in produzione): un ordine reale piazzato all'1 di notte italiana finisce in 'today', non in 'yesterday'", () => {
    // Ordine Redcare reale: created_date Mirakl 2026-08-25T22:01:39Z, cioè
    // le 00:01 del 26/08 in Italia — l'utente lo cercava sotto "Oggi" e non
    // lo trovava perché il vecchio getDateRange locale di products.routes.ts
    // calcolava "Oggi" nel fuso UTC del server, mettendolo sotto "Ieri".
    const orderTimestamp = new Date("2026-08-25T22:01:39Z");
    const today = getDateRange("today");
    const yesterday = getDateRange("yesterday");

    expect(orderTimestamp >= today.gte! && orderTimestamp <= today.lte!).toBe(true);
    expect(orderTimestamp >= yesterday.gte! && orderTimestamp <= yesterday.lte!).toBe(false);
  });

  it("an order just before the Italy midnight boundary falls in 'yesterday', not 'today'", () => {
    const orderTimestamp = new Date("2026-08-25T21:59:59Z"); // 23:59:59 in Italia il 25/08
    const today = getDateRange("today");
    const yesterday = getDateRange("yesterday");

    expect(orderTimestamp >= today.gte! && orderTimestamp <= today.lte!).toBe(false);
    expect(orderTimestamp >= yesterday.gte! && orderTimestamp <= yesterday.lte!).toBe(true);
  });

  it("'yesterday' is a full 24h Italy day immediately before 'today', with no gap or overlap", () => {
    const today = getDateRange("today");
    const yesterday = getDateRange("yesterday");
    expect(yesterday.lte!.getTime()).toBe(today.gte!.getTime() - 1);
    expect(today.gte!.getTime() - yesterday.gte!.getTime()).toBe(86_400_000);
  });

  it("last14 exists (added alongside products.routes.ts's PeriodTiles 14-day tile) and spans 14 days ending today", () => {
    const { gte, lte } = getDateRange("last14");
    const today = getDateRange("today");
    expect(lte).toEqual(today.lte);
    expect(today.lte!.getTime() - gte!.getTime()).toBeGreaterThan(13 * 86_400_000);
    expect(today.lte!.getTime() - gte!.getTime()).toBeLessThan(15 * 86_400_000);
  });
});

describe("italyDayStart", () => {
  it("returns the same Italy midnight regardless of what time of day the input is", () => {
    const morning = italyDayStart(new Date("2026-08-26T06:00:00Z"));
    const evening = italyDayStart(new Date("2026-08-26T20:00:00Z"));
    expect(morning).toEqual(evening);
    expect(morning).toEqual(new Date("2026-08-25T22:00:00.000Z"));
  });
});
