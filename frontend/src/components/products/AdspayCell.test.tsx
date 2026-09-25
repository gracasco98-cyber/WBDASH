import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdspayCell from "./AdspayCell";
import type { AmazonPpcBillingCycle } from "@/lib/api";

const cycle = (overrides: Partial<AmazonPpcBillingCycle> = {}): AmazonPpcBillingCycle => ({
  accountId: "acc-1",
  accountName: "Amazon EU",
  threshold: 500,
  accumulatedSpend: 412.8,
  carryOver: 0,
  progressPct: 82.6,
  remaining: 87.2,
  status: "accumulating",
  averageDailySpend7d: 46.8,
  estimatedDaysToThreshold: 4,
  updatedThrough: "2026-09-25",
  lastCharge: { invoiceId: "IT-INV-1", date: "2026-09-18", amount: 500.37, totalAmount: 610.45, source: "financial_events" },
  daily: [{ date: "2026-09-25", spend: 48.2, cumulative: 412.8 }],
  ...overrides,
});

describe("AdspayCell", () => {
  it("scores the ads spend since the last invoice charge from 0 to 100", () => {
    render(<AdspayCell cycle={cycle()} />);

    expect(screen.getByText("Adspay")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /adspay/i })).toHaveAttribute("aria-valuenow", "83");
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.getByText("€ 412,80")).toBeInTheDocument();
    expect(screen.getByText("/ € 500,00 + IVA")).toBeInTheDocument();
  });

  it("shows the day of the last invoice charge and what is left to the threshold", () => {
    render(<AdspayCell cycle={cycle()} />);

    expect(screen.getByText("dal 18 set")).toBeInTheDocument();
    expect(screen.getByText("mancano € 87,20")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /adspay/i }).closest("[title]"))
      .toHaveAttribute("title", expect.stringContaining("Ultimo addebito 18 set: € 500,37"));
  });

  it("says when no ads charge has been found yet", () => {
    render(<AdspayCell cycle={cycle({ lastCharge: null })} />);

    expect(screen.getByText("nessun addebito rilevato")).toBeInTheDocument();
  });

  it("flags the expected charge once the threshold is reached", () => {
    render(<AdspayCell cycle={cycle({ accumulatedSpend: 612, progressPct: 100, remaining: 0, status: "charge_expected" })} />);

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("addebito in arrivo")).toBeInTheDocument();
  });
});
