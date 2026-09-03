import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RedcareTrackedKeywords from "./RedcareTrackedKeywords";
import type { MarketingKeywordWatch } from "@/lib/api";

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer constructs one
// unconditionally on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

const listWatchesMock = vi.fn();
const watchHistoryMock = vi.fn();
const deleteWatchMock = vi.fn();
const createWatchMock = vi.fn();
const checkNowMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    marketingRedcare: {
      listWatches: (...args: unknown[]) => listWatchesMock(...args),
      watchHistory: (...args: unknown[]) => watchHistoryMock(...args),
      deleteWatch: (...args: unknown[]) => deleteWatchMock(...args),
      createWatch: (...args: unknown[]) => createWatchMock(...args),
      checkNow: (...args: unknown[]) => checkNowMock(...args),
    },
  },
}));

function watch(overrides: Partial<MarketingKeywordWatch> & { id: string }): MarketingKeywordWatch {
  return {
    market: "IT", keyword: "kw", ean: "111", label: null, isOwn: true,
    active: true, createdAt: "2026-08-31T00:00:00Z", latestSnapshot: null,
    ...overrides,
  };
}

describe("RedcareTrackedKeywords", () => {
  beforeEach(() => {
    listWatchesMock.mockReset();
    watchHistoryMock.mockReset();
    deleteWatchMock.mockReset();
    createWatchMock.mockReset();
    checkNowMock.mockReset();
    watchHistoryMock.mockResolvedValue({ snapshots: [] });
    deleteWatchMock.mockResolvedValue(undefined);
    createWatchMock.mockResolvedValue({});
    checkNowMock.mockResolvedValue({ checked: 1, errors: 0 });
  });

  it("groups multiple tracked keywords for the same product under one row, showing the best position and keyword count", async () => {
    listWatchesMock.mockResolvedValue({
      watches: [
        watch({
          id: "w1", ean: "8057808520034", keyword: "diosmina esperidina", label: "Deiscente VENAVIL",
          latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-09-01T03:00:00Z", found: true, position: 5, nbHits: 29, price: 11.9, sellerName: "NATURPLAN", productName: "x", promoted: null, promotedByReRanking: null },
        }),
        watch({
          id: "w2", ean: "8057808520034", keyword: "vene varicose", label: "Deiscente VENAVIL",
          latestSnapshot: { id: "s2", watchId: "w2", checkedAt: "2026-09-01T03:00:00Z", found: true, position: 1, nbHits: 12, price: 11.9, sellerName: "NATURPLAN", productName: "x", promoted: null, promotedByReRanking: null },
        }),
      ],
    });

    render(<RedcareTrackedKeywords refreshKey={0} />);

    expect(await screen.findByText("Deiscente VENAVIL")).toBeInTheDocument();
    expect(screen.getByText("2 keyword")).toBeInTheDocument();
    // Best (lowest) position across the product's keywords is #1, not #5.
    // "#1" appears twice: once as the group header's best-position badge,
    // once in w2's own keyword row (which is genuinely #1).
    expect(screen.getAllByText("#1")).toHaveLength(2);
    expect(screen.getByText("#5")).toBeInTheDocument();

    // Both keywords are visible as nested detail under the one product row.
    expect(screen.getByText("diosmina esperidina")).toBeInTheDocument();
    expect(screen.getByText("vene varicose")).toBeInTheDocument();
  });

  it("keeps two different products as two separate rows even when they share a keyword", async () => {
    listWatchesMock.mockResolvedValue({
      watches: [
        watch({ id: "w1", ean: "111", keyword: "diosmina esperidina", label: "Prodotto mio", isOwn: true }),
        watch({ id: "w2", ean: "222", keyword: "diosmina esperidina", label: "Prodotto concorrente", isOwn: false }),
      ],
    });

    render(<RedcareTrackedKeywords refreshKey={0} />);
    expect(await screen.findByText("Prodotto mio")).toBeInTheDocument();
    expect(screen.getByText("Prodotto concorrente")).toBeInTheDocument();
    // Each product shows its own "1 keyword" count, independent of the other.
    expect(screen.getAllByText("1 keyword")).toHaveLength(2);
  });

  it("falls back to the EAN as the product label when no watch has one", async () => {
    listWatchesMock.mockResolvedValue({ watches: [watch({ id: "w1", ean: "9999999999999", label: null })] });
    render(<RedcareTrackedKeywords refreshKey={0} />);
    expect(await screen.findByText("9999999999999")).toBeInTheDocument();
  });

  it("shows summary tiles computed from the tracked watches", async () => {
    listWatchesMock.mockResolvedValue({
      watches: [
        watch({ id: "w1", ean: "111", keyword: "kw1", latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-09-01T03:00:00Z", found: true, position: 2, nbHits: 10, price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null } }),
        watch({ id: "w2", ean: "222", keyword: "kw2", latestSnapshot: { id: "s2", watchId: "w2", checkedAt: "2026-09-01T05:00:00Z", found: true, position: 4, nbHits: 10, price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null } }),
        watch({ id: "w3", ean: "222", keyword: "kw3", latestSnapshot: null }),
      ],
    });

    render(<RedcareTrackedKeywords refreshKey={0} />);
    await screen.findByTestId("tile-Prodotti monitorati");

    expect(screen.getByTestId("tile-Prodotti monitorati")).toHaveTextContent("2"); // distinct EANs: 111, 222
    expect(screen.getByTestId("tile-Keyword monitorate")).toHaveTextContent("3"); // total watches
    // Average of found positions only (2, 4) = 3.0 — the not-yet-checked w3 is excluded.
    expect(screen.getByTestId("tile-Posizione media")).toHaveTextContent("#3.0");
    expect(screen.getByTestId("tile-Ultimo controllo")).not.toHaveTextContent("—");
  });

  it("shows a dash placeholder for average position and last check when nothing has a snapshot yet", async () => {
    listWatchesMock.mockResolvedValue({ watches: [watch({ id: "w1", ean: "111", keyword: "kw1", latestSnapshot: null })] });
    render(<RedcareTrackedKeywords refreshKey={0} />);
    await screen.findByTestId("tile-Prodotti monitorati");
    expect(screen.getByTestId("tile-Posizione media")).toHaveTextContent("—");
    expect(screen.getByTestId("tile-Ultimo controllo")).toHaveTextContent("—");
  });

  it("overlays each tracked keyword's own history line on one product's chart", async () => {
    // jsdom never lays out elements — getBoundingClientRect() always returns
    // all-zero — but Recharts' ResponsiveContainer needs a real measured
    // size to paint the chart body (legend included), not just a
    // ResizeObserver. Scoped via spyOn so it's restored afterwards.
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200, x: 0, y: 0,
      toJSON() { return this; },
    } as DOMRect);

    listWatchesMock.mockResolvedValue({
      watches: [
        watch({ id: "w1", ean: "111", keyword: "diosmina esperidina", label: "Prodotto X" }),
        watch({ id: "w2", ean: "111", keyword: "vene varicose", label: "Prodotto X" }),
      ],
    });
    watchHistoryMock.mockImplementation((id: string) =>
      Promise.resolve({
        snapshots: [{
          id: `s-${id}`, watchId: id, checkedAt: "2026-09-01T03:00:00Z", found: true,
          position: id === "w1" ? 1 : 5, nbHits: 10, price: null, sellerName: null, productName: null,
          promoted: null, promotedByReRanking: null,
        }],
      })
    );

    render(<RedcareTrackedKeywords refreshKey={0} />);
    await screen.findByText("Prodotto X");
    await userEvent.click(screen.getByText("Prodotto X"));

    await waitFor(() => expect(watchHistoryMock).toHaveBeenCalledWith("w1", 30));
    await waitFor(() => expect(watchHistoryMock).toHaveBeenCalledWith("w2", 30));

    // Each keyword's text renders twice once the chart mounts: once in the
    // static keyword row, once in the chart legend. If ProductChart
    // regressed to rendering only one <Line>, the missing keyword's legend
    // entry would drop this count from 2 to 1.
    await waitFor(() => expect(screen.getAllByText("diosmina esperidina")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText("vene varicose")).toHaveLength(2));

    rectSpy.mockRestore();
  });

  it("removes a single keyword without removing the rest of the product's keywords", async () => {
    listWatchesMock
      .mockResolvedValueOnce({
        watches: [
          watch({ id: "w1", ean: "111", keyword: "diosmina esperidina", label: "Prodotto X" }),
          watch({ id: "w2", ean: "111", keyword: "vene varicose", label: "Prodotto X" }),
        ],
      })
      .mockResolvedValueOnce({
        watches: [watch({ id: "w2", ean: "111", keyword: "vene varicose", label: "Prodotto X" })],
      });

    render(<RedcareTrackedKeywords refreshKey={0} />);
    await screen.findByText("Prodotto X");
    expect(screen.getByText("2 keyword")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rimuovi diosmina esperidina" }));

    expect(deleteWatchMock).toHaveBeenCalledWith("w1");
    await waitFor(() => expect(screen.getByText("1 keyword")).toBeInTheDocument());
    expect(screen.queryByText("diosmina esperidina")).not.toBeInTheDocument();
    expect(screen.getByText("vene varicose")).toBeInTheDocument();
  });

  it("lets the user add a new keyword to an already-tracked product from its expanded panel", async () => {
    listWatchesMock
      .mockResolvedValueOnce({
        watches: [watch({ id: "w1", ean: "111", keyword: "diosmina esperidina", label: "Prodotto X", isOwn: true })],
      })
      .mockResolvedValueOnce({
        watches: [
          watch({ id: "w1", ean: "111", keyword: "diosmina esperidina", label: "Prodotto X", isOwn: true }),
          watch({ id: "w2", ean: "111", keyword: "vene varicose", label: "Prodotto X", isOwn: true }),
        ],
      });

    render(<RedcareTrackedKeywords refreshKey={0} />);
    await userEvent.click(await screen.findByText("Prodotto X"));

    const input = screen.getByPlaceholderText("Nuova parola chiave");
    await userEvent.type(input, "vene varicose");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi keyword" }));

    expect(createWatchMock).toHaveBeenCalledWith({
      market: "IT", ean: "111", keyword: "vene varicose", label: "Prodotto X", isOwn: true,
    });
    await waitFor(() => expect(screen.getByText("vene varicose")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Nuova parola chiave")).toHaveValue("");
  });

  it("lets the user manually refresh a product's position without expanding it, then reloads the list", async () => {
    listWatchesMock
      .mockResolvedValueOnce({
        watches: [watch({ id: "w1", ean: "111", keyword: "kw1", label: "Prodotto X", latestSnapshot: null })],
      })
      .mockResolvedValueOnce({
        watches: [watch({
          id: "w1", ean: "111", keyword: "kw1", label: "Prodotto X",
          latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-09-02T03:00:00Z", found: true, position: 3, nbHits: 10, price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null },
        })],
      });

    render(<RedcareTrackedKeywords refreshKey={0} />);
    await screen.findByText("Prodotto X");

    await userEvent.click(screen.getByRole("button", { name: "Aggiorna posizione Prodotto X" }));

    expect(checkNowMock).toHaveBeenCalledWith({ market: "IT", ean: "111" });
    // "#3" appears twice once the reload lands: the group header's
    // best-position badge and the single keyword row's own badge.
    await waitFor(() => expect(screen.getAllByText("#3")).toHaveLength(2));
    // Refreshing must not have expanded the product row (the click didn't
    // toggle the header), so the chart's history fetch never fires.
    expect(watchHistoryMock).not.toHaveBeenCalled();
  });
});
