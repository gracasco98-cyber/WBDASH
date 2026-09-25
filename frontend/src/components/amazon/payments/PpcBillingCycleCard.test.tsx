import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PpcBillingCycleCard } from "./PpcBillingCycleCard";
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
  estimatedDaysToThreshold: 2,
  updatedThrough: "2026-09-24",
  lastCharge: { invoiceId: "IT-INV-1", date: "2026-09-18", amount: 500, totalAmount: 610, source: "financial_events" },
  daily: [
    { date: "2026-09-23", spend: 51.4, cumulative: 364.6 },
    { date: "2026-09-24", spend: 48.2, cumulative: 412.8 },
  ],
  ...overrides,
});

describe("PpcBillingCycleCard", () => {
  it("shows progress, daily increments and the last real charge", () => {
    render(<PpcBillingCycleCard cycles={[cycle()]} loading={false} />);
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText(/413\s*€/)).toBeInTheDocument();
    expect(screen.getByText(/87\s*€/)).toBeInTheDocument();
    expect(screen.getByText(/su soglia 500\s*€ \+ IVA/)).toBeInTheDocument();
    expect(screen.getByText("≈ 2 gg al ritmo attuale")).toBeInTheDocument();
  });

  it("lets the user inspect separate cycles when all accounts are selected", async () => {
    const user = userEvent.setup();
    const second = cycle({ accountId: "acc-2", accountName: "Amazon Brand 2", accumulatedSpend: 500, progressPct: 100, remaining: 0, status: "charge_expected" });
    render(<PpcBillingCycleCard cycles={[cycle(), second]} loading={false} />);
    await user.click(screen.getByRole("button", { name: /Amazon Brand 2 · 100%/i }));
    expect(screen.getByText("100% · addebito atteso")).toBeInTheDocument();
    expect(screen.getByText(/^0\s*€$/)).toBeInTheDocument();
  });

  it("shows the net invoice and the amount deducted from the Amazon balance", () => {
    render(<PpcBillingCycleCard cycles={[cycle()]} loading={false} />);
    expect(screen.getByText("18 set")).toBeInTheDocument();
    expect(screen.getByText(/^500,00\s*€$/)).toBeInTheDocument();
    expect(screen.getByText(/^610,00\s*€$/)).toBeInTheDocument();
  });

  it("shows the charge-day spend carried into the new cycle", () => {
    render(<PpcBillingCycleCard cycles={[cycle({ carryOver: 50 })]} loading={false} />);
    expect(screen.getByText(/di cui 50\s*€ dal giorno dell.addebito/)).toBeInTheDocument();
  });

  it("warns when the cycle still starts from a settlement row", () => {
    const fromSettlement = cycle({
      lastCharge: { invoiceId: "sett-1", date: "2026-09-18", amount: 610, totalAmount: 610, source: "settlement" },
    });
    render(<PpcBillingCycleCard cycles={[fromSettlement]} loading={false} />);
    expect(screen.getByText(/da liquidazione/i)).toBeInTheDocument();
  });
});
