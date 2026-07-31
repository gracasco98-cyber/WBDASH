import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AmazonAccountGuard from "./AmazonAccountGuard";

const mockUseAmazonAccount = vi.fn();
vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => mockUseAmazonAccount(),
}));

describe("AmazonAccountGuard", () => {
  beforeEach(() => {
    mockUseAmazonAccount.mockReset();
  });

  it("does not render children while account list is loading", () => {
    mockUseAmazonAccount.mockReturnValue({
      accounts: [],
      selectedAccountId: null,
      needsSelection: false,
      loading: true,
      selectAccount: vi.fn(),
    });

    render(<AmazonAccountGuard><div>Page content</div></AmazonAccountGuard>);

    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("prompts for account selection instead of rendering children when 2+ accounts exist and none is selected", () => {
    mockUseAmazonAccount.mockReturnValue({
      accounts: [
        { id: "a1", name: "Account EU Principale", sellerId: "S1", region: "EU" },
        { id: "a2", name: "Account Secondario IT", sellerId: "S2", region: "EU" },
      ],
      selectedAccountId: null,
      needsSelection: true,
      loading: false,
      selectAccount: vi.fn(),
    });

    render(<AmazonAccountGuard><div>Page content</div></AmazonAccountGuard>);

    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
    expect(screen.getByText(/seleziona un account amazon/i)).toBeInTheDocument();
    expect(screen.getByText("Account EU Principale")).toBeInTheDocument();
    expect(screen.getByText("Account Secondario IT")).toBeInTheDocument();
  });

  it("renders children once an account is selected", () => {
    mockUseAmazonAccount.mockReturnValue({
      accounts: [
        { id: "a1", name: "Account EU Principale", sellerId: "S1", region: "EU" },
        { id: "a2", name: "Account Secondario IT", sellerId: "S2", region: "EU" },
      ],
      selectedAccountId: "a1",
      needsSelection: true,
      loading: false,
      selectAccount: vi.fn(),
    });

    render(<AmazonAccountGuard><div>Page content</div></AmazonAccountGuard>);

    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders children when there is only one account (nothing to choose)", () => {
    mockUseAmazonAccount.mockReturnValue({
      accounts: [{ id: "a1", name: "Account Unico", sellerId: "S1", region: "EU" }],
      selectedAccountId: null,
      needsSelection: false,
      loading: false,
      selectAccount: vi.fn(),
    });

    render(<AmazonAccountGuard><div>Page content</div></AmazonAccountGuard>);

    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
