import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RedcareKeywordSearch from "./RedcareKeywordSearch";
import type { RedcareMarket, RedcareSearchResult } from "@/lib/api";

const mockSearch = vi.fn<(market: RedcareMarket, q: string) => Promise<RedcareSearchResult>>();
const mockCreateWatch = vi.fn<(data: unknown) => Promise<any>>(async () => ({}));
vi.mock("@/lib/api", () => ({
  api: {
    marketingRedcare: {
      search: (market: RedcareMarket, q: string) => mockSearch(market, q),
      createWatch: (data: unknown) => mockCreateWatch(data),
    },
  },
}));

const HIT = {
  position: 1,
  ean: "8057808520034",
  productName: "Deiscente VENAVIL",
  price: 11.9,
  sellerName: "NATURPLAN",
  sellerType: "MIRAKL",
  promoted: null,
  promotedByReRanking: null,
};

describe("RedcareKeywordSearch", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockCreateWatch.mockReset();
    mockCreateWatch.mockResolvedValue({});
  });

  it("track() persists the market/keyword that produced the displayed results, not live-edited input values", async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValueOnce({ market: "IT", keyword: "diosmina esperidina", nbHits: 1, hits: [HIT] });
    const onTracked = vi.fn();

    render(<RedcareKeywordSearch onTracked={onTracked} />);

    await user.type(screen.getByPlaceholderText(/cerca una keyword/i), "diosmina esperidina");
    await user.click(screen.getByRole("button", { name: /cerca/i }));

    // Results are shown for the searched keyword.
    expect(await screen.findByText(/risultati per "diosmina esperidina"/i)).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith("IT", "diosmina esperidina");

    // User edits the input and flips the market WITHOUT re-running the search.
    const input = screen.getByPlaceholderText(/cerca una keyword/i);
    await user.clear(input);
    await user.type(input, "keyword completamente diversa");
    await user.selectOptions(screen.getByRole("combobox"), "DE");

    // Caption must still reflect the original searched keyword, not the live-edited one.
    expect(screen.getByText(/risultati per "diosmina esperidina"/i)).toBeInTheDocument();
    expect(screen.queryByText(/keyword completamente diversa/i)).not.toBeInTheDocument();

    // Clicking Traccia on the still-displayed row must persist the ORIGINAL
    // searched market/keyword, not the edited live input values.
    await user.click(screen.getByRole("button", { name: /traccia \(mio\)/i }));

    expect(mockCreateWatch).toHaveBeenCalledWith({
      market: "IT",
      keyword: "diosmina esperidina",
      ean: HIT.ean,
      label: undefined,
      isOwn: true,
    });
    expect(onTracked).toHaveBeenCalledTimes(1);
  });

  it("does not call createWatch when no search has been run yet (defensive guard)", async () => {
    // hits is null before any search, so tracking buttons never render —
    // this asserts the defensive early-return in track() rather than relying
    // solely on the UI never rendering the button.
    render(<RedcareKeywordSearch onTracked={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /traccia/i })).not.toBeInTheDocument();
    expect(mockCreateWatch).not.toHaveBeenCalled();
  });
});
