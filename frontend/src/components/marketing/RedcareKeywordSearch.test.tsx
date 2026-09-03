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
  brand: "NATURPLAN",
  rating: 4.5,
  ratingCount: 12,
  inStock: true,
  category: "Benessere > Sistema Cardiovascolare > Gambe Pesanti",
  sellerCount: 1,
  imageUrl: "https://cdn.redcare.it/images/mp/prod/abc123",
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
      label: HIT.productName,
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

  it("shows the real market-opportunity fields returned by the API (category, rating, stock)", async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValueOnce({ market: "IT", keyword: "diosmina esperidina", nbHits: 1, hits: [HIT] });
    render(<RedcareKeywordSearch onTracked={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/cerca una keyword/i), "diosmina esperidina");
    await user.click(screen.getByRole("button", { name: /cerca/i }));

    expect(await screen.findByText("Benessere > Sistema Cardiovascolare > Gambe Pesanti")).toBeInTheDocument();
    // "4.5" appears twice with a single hit: the row's own rating and the
    // market-stats bar's average (same value with only one result).
    expect(screen.getAllByText("4.5")).toHaveLength(2);
    expect(screen.getByText("(12)")).toBeInTheDocument();
    expect(screen.getByText("Disponibile")).toBeInTheDocument();
  });

  it("shows a product thumbnail when the hit has an image URL, and a placeholder when it doesn't", async () => {
    const user = userEvent.setup();
    const withImage = { ...HIT, ean: "111", productName: "With image" };
    const withoutImage = { ...HIT, ean: "222", productName: "No image", imageUrl: null };
    mockSearch.mockResolvedValueOnce({ market: "IT", keyword: "x", nbHits: 2, hits: [withImage, withoutImage] });

    render(<RedcareKeywordSearch onTracked={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/cerca una keyword/i), "x");
    await user.click(screen.getByRole("button", { name: "Cerca" }));
    await screen.findByText("With image");

    const img = screen.getByRole("img", { name: "With image" });
    expect(img).toHaveAttribute("src", "https://cdn.redcare.it/images/mp/prod/abc123");
    expect(screen.queryByRole("img", { name: "No image" })).not.toBeInTheDocument();
  });

  it("shows aggregate market stats computed from the current results", async () => {
    const user = userEvent.setup();
    const a = { ...HIT, ean: "111", price: 10, rating: 4, inStock: true };
    const b = { ...HIT, ean: "222", price: 20, rating: 5, inStock: false };
    mockSearch.mockResolvedValueOnce({ market: "IT", keyword: "x", nbHits: 40, hits: [a, b] });

    render(<RedcareKeywordSearch onTracked={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/cerca una keyword/i), "x");
    await user.click(screen.getByRole("button", { name: "Cerca" }));
    await screen.findByTestId("market-tile-Prezzo medio");

    expect(screen.getByTestId("market-tile-Prezzo medio")).toHaveTextContent("15"); // avg of 10 and 20
    expect(screen.getByTestId("market-tile-Rating medio")).toHaveTextContent("4.5"); // avg of 4 and 5
    expect(screen.getByTestId("market-tile-Disponibili")).toHaveTextContent("1/2");
    expect(screen.getByTestId("market-tile-Risultati totali")).toHaveTextContent("40");
  });

  it("re-sorts the results table by price when the Prezzo column header is clicked", async () => {
    const user = userEvent.setup();
    const cheap = { ...HIT, position: 3, ean: "111", productName: "Cheap", price: 5 };
    const expensive = { ...HIT, position: 1, ean: "222", productName: "Expensive", price: 50 };
    mockSearch.mockResolvedValueOnce({ market: "IT", keyword: "x", nbHits: 2, hits: [expensive, cheap] });

    render(<RedcareKeywordSearch onTracked={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/cerca una keyword/i), "x");
    await user.click(screen.getByRole("button", { name: /cerca/i }));
    await screen.findByText("Expensive");

    // Default order is by position: Expensive (#1) before Cheap (#3).
    let rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows[0]).toHaveTextContent("Expensive");
    expect(rows[1]).toHaveTextContent("Cheap");

    await user.click(screen.getByRole("button", { name: /prezzo/i }));

    // Ascending price: Cheap (€5) before Expensive (€50).
    rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Cheap");
    expect(rows[1]).toHaveTextContent("Expensive");
  });
});
