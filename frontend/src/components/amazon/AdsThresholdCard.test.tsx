import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AmazonPpcBillingCycle } from "@/lib/api";

const ppcBillingCycleMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { amazon: { ppcBillingCycle: ppcBillingCycleMock } } }));
vi.mock("@/hooks/useAmazonAccount", () => ({ useAmazonAccount: () => ({ selectedAccountId: null }) }));

import AdsThresholdCard from "./AdsThresholdCard";

const cycle = (overrides: Partial<AmazonPpcBillingCycle> = {}): AmazonPpcBillingCycle => ({
  accountId: "acc-1",
  accountName: "Amazon EU",
  threshold: 600,
  accumulatedSpend: 412.8,
  carryOver: 0,
  progressPct: 68.8,
  remaining: 187.2,
  status: "accumulating",
  averageDailySpend7d: 46.8,
  estimatedDaysToThreshold: 4,
  updatedThrough: "2026-09-25",
  lastCharge: { invoiceId: "IT-INV-1", date: "2026-09-18", amount: 600.37, totalAmount: 732.45, source: "financial_events" },
  daily: [],
  ...overrides,
});

describe("AdsThresholdCard", () => {
  beforeEach(() => { ppcBillingCycleMock.mockReset(); });

  it("shows the Amazon.it spend since the last invoice charge against the threshold", async () => {
    ppcBillingCycleMock.mockResolvedValue({ threshold: 600, cycles: [cycle()] });
    render(<AdsThresholdCard />);

    expect(await screen.findByText("€ 412,80")).toBeInTheDocument();
    expect(ppcBillingCycleMock).toHaveBeenCalledWith({ amazonAccountId: "ALL" });
    expect(screen.getByText("di € 600")).toBeInTheDocument();
    expect(screen.getByText("Score 68,8/100")).toBeInTheDocument();
    expect(screen.getByText("Mancano € 187,20")).toBeInTheDocument();
    expect(screen.getByText("Ultimo addebito 18 set · € 600,37 + IVA")).toBeInTheDocument();
  });

  it("flags the expected charge once the threshold is reached", async () => {
    ppcBillingCycleMock.mockResolvedValue({
      threshold: 600,
      cycles: [cycle({ accumulatedSpend: 612, progressPct: 100, remaining: 0, status: "charge_expected" })],
    });
    render(<AdsThresholdCard />);

    expect(await screen.findByText("Soglia raggiunta · addebito in attesa")).toBeInTheDocument();
  });

  it("tells the user when the threshold data cannot be loaded", async () => {
    ppcBillingCycleMock.mockRejectedValue(new Error("500"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AdsThresholdCard />);

    expect(await screen.findByText("Dati soglia non disponibili")).toBeInTheDocument();
  });
});
