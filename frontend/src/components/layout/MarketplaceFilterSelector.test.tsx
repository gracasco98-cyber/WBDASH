import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MarketplaceFilterSelector from "./MarketplaceFilterSelector";

const mockUseMarketplaceFilter = vi.fn();
vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => mockUseMarketplaceFilter(),
}));

describe("MarketplaceFilterSelector", () => {
  it("shows 'Tutti i canali' when marketplace is 'all'", () => {
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "all", setMarketplace: vi.fn() });
    render(<MarketplaceFilterSelector />);
    expect(screen.getByText("Tutti i canali")).toBeInTheDocument();
  });

  it("opens a dropdown with channel options on click and calls setMarketplace on selection", () => {
    const setMarketplace = vi.fn();
    mockUseMarketplaceFilter.mockReturnValue({ marketplace: "all", setMarketplace });
    render(<MarketplaceFilterSelector />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Amazon IT"));
    expect(setMarketplace).toHaveBeenCalledWith("AMAZON_IT");
  });
});
