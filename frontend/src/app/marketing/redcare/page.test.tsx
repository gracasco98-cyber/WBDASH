import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RedcareKeywordBiPage from "./page";

// Grouping/summary-tiles/chart behavior for the tracked-products section has
// its own dedicated test file (RedcareTrackedKeywords.test.tsx) — this file
// only covers page-level composition (search -> track -> refresh wiring).
const searchMock = vi.fn();
const createWatchMock = vi.fn();
const listWatchesMock = vi.fn();
const watchHistoryMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    marketingRedcare: {
      search: (...args: unknown[]) => searchMock(...args),
      createWatch: (...args: unknown[]) => createWatchMock(...args),
      listWatches: (...args: unknown[]) => listWatchesMock(...args),
      watchHistory: (...args: unknown[]) => watchHistoryMock(...args),
      deleteWatch: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe("RedcareKeywordBiPage", () => {
  beforeEach(() => {
    searchMock.mockReset();
    createWatchMock.mockReset();
    listWatchesMock.mockReset();
    listWatchesMock.mockResolvedValue({ watches: [] });
    watchHistoryMock.mockReset();
    watchHistoryMock.mockResolvedValue({ snapshots: [] });
  });

  it("searches a keyword and shows the ranked results table", async () => {
    searchMock.mockResolvedValue({
      market: "IT", keyword: "diosmina esperidina", nbHits: 29,
      hits: [
        { position: 1, ean: "8057808520034", productName: "Deiscente VENAVIL", price: 11.9, sellerName: "NATURPLAN", sellerType: "MIRAKL", promoted: null, promotedByReRanking: null },
      ],
    });

    render(<RedcareKeywordBiPage />);
    await userEvent.type(screen.getByPlaceholderText(/cerca una keyword/i), "diosmina esperidina");
    await userEvent.click(screen.getByRole("button", { name: "Cerca" }));

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("IT", "diosmina esperidina"));
    expect(await screen.findByText("Deiscente VENAVIL")).toBeInTheDocument();
    expect(screen.getByText("NATURPLAN")).toBeInTheDocument();
  });

  it("tracks a result row as own product from Cerebro, then shows it under Keyword Tracker once that tab is opened", async () => {
    searchMock.mockResolvedValue({
      market: "IT", keyword: "diosmina esperidina", nbHits: 1,
      hits: [
        { position: 1, ean: "8057808520034", productName: "Deiscente VENAVIL", price: 11.9, sellerName: "NATURPLAN", sellerType: "MIRAKL", promoted: null, promotedByReRanking: null },
      ],
    });
    createWatchMock.mockResolvedValue({});

    render(<RedcareKeywordBiPage />);
    await userEvent.type(screen.getByPlaceholderText(/cerca una keyword/i), "diosmina esperidina");
    await userEvent.click(screen.getByRole("button", { name: "Cerca" }));
    await screen.findByText("Deiscente VENAVIL");

    // Two track buttons render per row ("mio" / "competitor") — match the
    // specific one, since a bare /traccia/i would match both ambiguously.
    await userEvent.click(screen.getByRole("button", { name: /traccia \(mio\)/i }));

    await waitFor(() => expect(createWatchMock).toHaveBeenCalledWith({
      market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", label: undefined, isOwn: true,
    }));

    // Keyword Tracker isn't mounted while on Cerebro, so listWatches hasn't
    // fired yet — switching tabs is what triggers its first load.
    expect(listWatchesMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /keyword tracker/i }));
    await waitFor(() => expect(listWatchesMock).toHaveBeenCalledTimes(1));
  });

  it("renders tracked watches with their latest position under the Keyword Tracker tab", async () => {
    listWatchesMock.mockResolvedValue({
      watches: [{
        id: "w1", market: "IT", keyword: "diosmina esperidina", ean: "8057808520034",
        label: "Deiscente VENAVIL", isOwn: true, active: true, createdAt: "2026-08-31T00:00:00Z",
        latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-08-31T03:00:00Z", found: true, position: 1, nbHits: 29, price: 11.9, sellerName: "NATURPLAN", productName: "Deiscente VENAVIL", promoted: null, promotedByReRanking: null },
      }],
    });

    render(<RedcareKeywordBiPage />);
    await userEvent.click(screen.getByRole("button", { name: /keyword tracker/i }));

    expect(await screen.findByText("Deiscente VENAVIL")).toBeInTheDocument();
    // "#1" renders twice for a single-keyword product: the group header's
    // best-position badge, and that one keyword's own row.
    expect(screen.getAllByText("#1")).toHaveLength(2);
  });
});
