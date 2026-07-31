import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AmazonAccountProvider } from "./AmazonAccountContext";
import { useAmazonAccount } from "@/hooks/useAmazonAccount";

const mockUseAuth = vi.fn();
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockListAccounts = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { amazon: { listAccounts: (...args: unknown[]) => mockListAccounts(...args) } },
}));

function Probe() {
  const { loading, needsSelection, accounts } = useAmazonAccount();
  return <div>loading={String(loading)} needsSelection={String(needsSelection)} count={accounts.length}</div>;
}

describe("AmazonAccountProvider", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockListAccounts.mockReset();
    window.localStorage.clear();
  });

  it("stays in the loading state while auth is still resolving, even though user is momentarily null", () => {
    // This is the state React is in for a render or two on every fresh page
    // load: AuthProvider hasn't confirmed the session yet, so user is null
    // but that must NOT be read as "definitely logged out, 0 accounts".
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    render(
      <AmazonAccountProvider>
        <Probe />
      </AmazonAccountProvider>
    );

    expect(screen.getByText(/loading=true/)).toBeInTheDocument();
    expect(mockListAccounts).not.toHaveBeenCalled();
  });

  it("fetches accounts once auth resolves to a logged-in user", async () => {
    mockListAccounts.mockResolvedValue([
      { id: "a1", name: "Account EU", sellerId: "S1", region: "EU" },
      { id: "a2", name: "Account IT", sellerId: "S2", region: "EU" },
    ]);
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });

    render(
      <AmazonAccountProvider>
        <Probe />
      </AmazonAccountProvider>
    );

    await waitFor(() => expect(screen.getByText(/count=2/)).toBeInTheDocument());
    expect(screen.getByText(/needsSelection=true/)).toBeInTheDocument();
  });

  it("resolves to zero accounts once auth confirms no session", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    render(
      <AmazonAccountProvider>
        <Probe />
      </AmazonAccountProvider>
    );

    await waitFor(() => expect(screen.getByText(/loading=false/)).toBeInTheDocument());
    expect(screen.getByText(/count=0/)).toBeInTheDocument();
    expect(mockListAccounts).not.toHaveBeenCalled();
  });
});
