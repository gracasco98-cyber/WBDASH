import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RedcareKeywordBiPage from "./page";

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer constructs one
// unconditionally on mount, so the "expand a chart" test needs a stub.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

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
    await userEvent.click(screen.getByRole("button", { name: /cerca/i }));

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("IT", "diosmina esperidina"));
    expect(await screen.findByText("Deiscente VENAVIL")).toBeInTheDocument();
    expect(screen.getByText("NATURPLAN")).toBeInTheDocument();
  });

  it("tracks a result row as own product and refreshes the tracked list", async () => {
    searchMock.mockResolvedValue({
      market: "IT", keyword: "diosmina esperidina", nbHits: 1,
      hits: [
        { position: 1, ean: "8057808520034", productName: "Deiscente VENAVIL", price: 11.9, sellerName: "NATURPLAN", sellerType: "MIRAKL", promoted: null, promotedByReRanking: null },
      ],
    });
    createWatchMock.mockResolvedValue({});

    render(<RedcareKeywordBiPage />);
    await userEvent.type(screen.getByPlaceholderText(/cerca una keyword/i), "diosmina esperidina");
    await userEvent.click(screen.getByRole("button", { name: /cerca/i }));
    await screen.findByText("Deiscente VENAVIL");

    // Two track buttons render per row ("mio" / "competitor") — match the
    // specific one, since a bare /traccia/i would match both ambiguously.
    await userEvent.click(screen.getByRole("button", { name: /traccia \(mio\)/i }));

    await waitFor(() => expect(createWatchMock).toHaveBeenCalledWith({
      market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", label: undefined, isOwn: true,
    }));
    // listWatches is called once on mount, once again after tracking
    await waitFor(() => expect(listWatchesMock).toHaveBeenCalledTimes(2));
  });

  it("renders tracked watches with their latest position", async () => {
    listWatchesMock.mockResolvedValue({
      watches: [{
        id: "w1", market: "IT", keyword: "diosmina esperidina", ean: "8057808520034",
        label: null, isOwn: true, active: true, createdAt: "2026-08-31T00:00:00Z",
        latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-08-31T03:00:00Z", found: true, position: 1, nbHits: 29, price: 11.9, sellerName: "NATURPLAN", productName: "Deiscente VENAVIL", promoted: null, promotedByReRanking: null },
      }],
    });

    render(<RedcareKeywordBiPage />);
    expect(await screen.findByText("diosmina esperidina")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("overlays own and competitor watches on the same keyword's chart", async () => {
    // jsdom never lays out elements — getBoundingClientRect() always
    // returns all-zero — but Recharts' ResponsiveContainer needs a real
    // measured size to paint the chart body (legend included), not just a
    // ResizeObserver. Stub it for this test only; scoped via spyOn so it's
    // restored afterwards and doesn't affect other tests' DOM measurements.
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200, x: 0, y: 0,
      toJSON() { return this; },
    } as DOMRect);

    listWatchesMock.mockResolvedValue({
      watches: [
        {
          id: "w1", market: "IT", keyword: "diosmina esperidina", ean: "8057808520034",
          label: null, isOwn: true, active: true, createdAt: "2026-08-31T00:00:00Z",
          latestSnapshot: { id: "s1", watchId: "w1", checkedAt: "2026-08-31T03:00:00Z", found: true, position: 1, nbHits: 29, price: 11.9, sellerName: "NATURPLAN", productName: "Deiscente VENAVIL", promoted: null, promotedByReRanking: null },
        },
        {
          id: "w2", market: "IT", keyword: "diosmina esperidina", ean: "4006381333931",
          label: "Competitor SRL", isOwn: false, active: true, createdAt: "2026-08-31T00:00:00Z",
          latestSnapshot: { id: "s2", watchId: "w2", checkedAt: "2026-08-31T03:00:00Z", found: true, position: 3, nbHits: 29, price: 12.5, sellerName: "Competitor SRL", productName: "Competitor product", promoted: null, promotedByReRanking: null },
        },
      ],
    });
    watchHistoryMock.mockImplementation((id: string) =>
      Promise.resolve({
        snapshots: [{
          id: `s-${id}`, watchId: id, checkedAt: "2026-08-31T03:00:00Z", found: true,
          position: id === "w1" ? 1 : 3, nbHits: 29, price: 11.9, sellerName: "x", productName: "y",
          promoted: null, promotedByReRanking: null,
        }],
      })
    );

    render(<RedcareKeywordBiPage />);
    await screen.findByText("diosmina esperidina");
    await userEvent.click(screen.getByText("diosmina esperidina"));

    await waitFor(() => expect(watchHistoryMock).toHaveBeenCalledWith("w1", 30));
    await waitFor(() => expect(watchHistoryMock).toHaveBeenCalledWith("w2", 30));

    // Each watch's label renders twice once the chart mounts: once in the
    // static watch row, once in the chart legend. If KeywordChart regressed
    // to rendering only one <Line>, the missing watch's legend entry would
    // drop this count from 2 to 1 — a bare "does watchHistory get called"
    // check wouldn't catch that, since the fetch loop is independent of
    // how many <Line> elements actually render.
    await waitFor(() => expect(screen.getAllByText("Il tuo prodotto")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText("Competitor SRL")).toHaveLength(2));

    rectSpy.mockRestore();
  });
});
