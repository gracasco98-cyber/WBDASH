import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarketplaceFilterProvider } from "@/context/MarketplaceFilterContext";
import AmazonOverviewPage from "./page";

// This page's own MARKETPLACES pill row speaks raw Amazon codes ("IT", "DE", ...)
// while the global filter (seeded below via localStorage, same key/pattern as
// MarketplaceFilterContext.test.tsx) speaks "AMAZON_IT" — the regression this
// test guards is the translation boundary added at the top of the page
// component that reconciles the two value spaces.
vi.mock("@/lib/api", () => ({
  api: {
    overview: vi.fn().mockResolvedValue(null),
    summary: vi.fn().mockResolvedValue(null),
    amazon: {
      overview: vi.fn().mockResolvedValue(null),
      summary: vi.fn().mockResolvedValue(null),
      timeseries: vi.fn().mockResolvedValue([]),
      products: vi.fn().mockResolvedValue({ products: [], kpis: null }),
      dashboard: vi.fn().mockResolvedValue(null),
      catalogImages: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe("AmazonOverviewPage — global marketplace filter translation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("highlights the page's own 'IT' pill when the global filter is AMAZON_IT", async () => {
    window.localStorage.setItem("wbdash:marketplaceFilter", "AMAZON_IT");

    render(
      <MarketplaceFilterProvider>
        <AmazonOverviewPage />
      </MarketplaceFilterProvider>
    );

    // The stored global value is adopted asynchronously post-mount (see
    // MarketplaceFilterContext), so the "IT" pill starts inactive and only
    // becomes active once the translation picks up "AMAZON_IT" -> "IT".
    const itText = await screen.findByText("IT");
    const itButton = itText.closest("button");
    expect(itButton).not.toBeNull();
    await waitFor(() => expect(itButton!.className).toContain("text-accent-primary"));

    // Sanity check: "Tutti" (all) must NOT be the active pill anymore.
    const tuttiButton = screen.getByText("Tutti").closest("button");
    expect(tuttiButton!.className).not.toContain("text-accent-primary");
  });
});
