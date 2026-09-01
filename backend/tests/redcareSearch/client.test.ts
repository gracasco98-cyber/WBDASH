import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { redcareSearchMocks } from "../helpers/msw-server";
import { fetchSearchResults } from "../../src/redcareSearch/client";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe("fetchSearchResults", () => {
  it("parses hits in position order, converts price from cents to euro, and carries seller/ranking info", async () => {
    server.use(
      redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
        {
          ean: "8057808520034", productName: "Deiscente VENAVIL", price: 1190,
          best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" },
          _rankingInfo: { promoted: null, promotedByReRanking: null },
        },
        {
          ean: "8054346340155", productName: "Diosmina Esperidina VitaminPure", price: 1990,
          best_offer: { seller: { name: "VitaminPure" }, type: "OTHER" },
          _rankingInfo: { promoted: true, promotedByReRanking: true },
        },
      ], 29),
    );

    const result = await fetchSearchResults("IT", "diosmina esperidina");

    expect(result.market).toBe("IT");
    expect(result.nbHits).toBe(29);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]).toEqual({
      position: 1, ean: "8057808520034", productName: "Deiscente VENAVIL",
      price: 11.9, sellerName: "NATURPLAN", sellerType: "MIRAKL",
      promoted: null, promotedByReRanking: null,
    });
    expect(result.hits[1]).toMatchObject({ position: 2, promoted: true, promotedByReRanking: true });
  });

  it("uses the DE domain and index when market=DE", async () => {
    server.use(
      redcareSearchMocks.searchPage("DE", "products_mktplc_prod_DE_de", [
        {
          ean: "4000000000000", productName: "Diosmin Test DE", price: 999,
          best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" }, _rankingInfo: {},
        },
      ], 5),
    );

    const result = await fetchSearchResults("DE", "diosmin");
    expect(result.market).toBe("DE");
    expect(result.hits[0].ean).toBe("4000000000000");
  });

  it("handles a hit missing best_offer/_rankingInfo without throwing", async () => {
    server.use(
      redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
        { ean: "1", productName: "No offer data", price: 500 },
      ], 1),
    );
    const result = await fetchSearchResults("IT", "x");
    expect(result.hits[0]).toMatchObject({ sellerName: null, sellerType: null, promoted: null, promotedByReRanking: null });
  });

  it("throws an explicit error when the InstantSearchInitialResults blob is missing", async () => {
    server.use(redcareSearchMocks.searchPageMissingBlob("IT"));
    await expect(fetchSearchResults("IT", "diosmina")).rejects.toThrow(/InstantSearchInitialResults/);
  });

  it("throws an explicit error on a non-2xx HTTP response", async () => {
    server.use(redcareSearchMocks.httpError("IT", 503));
    await expect(fetchSearchResults("IT", "diosmina")).rejects.toThrow(/503/);
  });
});
