import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PpcBillingCycleCard } from "./PpcBillingCycleCard";
import type { AmazonPpcBillingCycle } from "@/lib/api";

const cycle = (overrides: Partial<AmazonPpcBillingCycle> = {}): AmazonPpcBillingCycle => ({
  accountId: "acc-1",
  accountName: "Amazon EU",
  threshold: 600,
  accumulatedSpend: 412.8,
  progressPct: 68.8,
  remaining: 187.2,
  status: "accumulating",
  averageDailySpend7d: 46.8,
  estimatedDaysToThreshold: 4,
  updatedThrough: "2026-09-24",
  lastCharge: { settlementId: "sett-1", date: "2026-09-18", amount: 600 },
  daily: [
    { date: "2026-09-23", spend: 51.4, cumulative: 364.6 },
    { date: "2026-09-24", spend: 48.2, cumulative: 412.8 },
  ],
  ...overrides,
});

describe("PpcBillingCycleCard", () => {
  it("shows progress, daily increments and the last real charge", () => {
    render(<PpcBillingCycleCard cycles={[cycle()]} loading={false} />);
    expect(screen.getByText("69%")).toBeInTheDocument();
    expect(screen.getByText(/413\s*€/)).toBeInTheDocument();
    expect(screen.getByText(/187\s*€/)).toBeInTheDocument();
    expect(screen.getAllByText(/600\s*€/)).toHaveLength(2);
    expect(screen.getByText("≈ 4 gg al ritmo attuale")).toBeInTheDocument();
  });

  it("lets the user inspect separate cycles when all accounts are selected", async () => {
    const user = userEvent.setup();
    const second = cycle({ accountId: "acc-2", accountName: "Amazon Brand 2", accumulatedSpend: 600, progressPct: 100, remaining: 0, status: "charge_expected" });
    render(<PpcBillingCycleCard cycles={[cycle(), second]} loading={false} />);
    await user.click(screen.getByRole("button", { name: /Amazon Brand 2 · 100%/i }));
    expect(screen.getByText("100% · addebito atteso")).toBeInTheDocument();
    expect(screen.getByText(/^0\s*€$/)).toBeInTheDocument();
  });
});
