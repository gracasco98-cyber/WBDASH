import { describe, it, expect } from "vitest";
import { matchEanInResult } from "../../src/redcareSearch/service";
import type { RedcareSearchResult } from "../../src/redcareSearch/client";

const baseResult: RedcareSearchResult = {
  market: "IT", keyword: "diosmina esperidina", nbHits: 29,
  hits: [
    {
      position: 1, ean: "8057808520034", productName: "Deiscente VENAVIL",
      price: 11.9, sellerName: "NATURPLAN", sellerType: "MIRAKL", promoted: null, promotedByReRanking: null,
    },
    {
      position: 2, ean: "8054346340155", productName: "VitaminPure",
      price: 19.9, sellerName: "VitaminPure", sellerType: "OTHER", promoted: true, promotedByReRanking: true,
    },
  ],
};

describe("matchEanInResult", () => {
  it("returns found=true with the matching hit's data when the ean is present", () => {
    expect(matchEanInResult(baseResult, "8057808520034")).toEqual({
      found: true, position: 1, nbHits: 29, price: 11.9,
      sellerName: "NATURPLAN", productName: "Deiscente VENAVIL",
      promoted: null, promotedByReRanking: null,
    });
  });

  it("returns found=false with null detail fields (but a real nbHits) when the ean is absent", () => {
    expect(matchEanInResult(baseResult, "0000000000000")).toEqual({
      found: false, position: null, nbHits: 29, price: null,
      sellerName: null, productName: null, promoted: null, promotedByReRanking: null,
    });
  });
});
