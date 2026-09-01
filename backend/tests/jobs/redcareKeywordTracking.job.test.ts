import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { setupTestDb, truncateAll, type TestDb } from "../helpers/db";
import { redcareSearchMocks } from "../helpers/msw-server";
import { createOrReactivateWatch, findLatestSnapshot } from "../../src/repositories/marketing/redcareWatch.repo";

const server = setupServer();
let db: TestDb;
let runRedcareKeywordTracking: typeof import("../../src/jobs/redcareKeywordTracking.job").runRedcareKeywordTracking;

beforeAll(async () => {
  db = await setupTestDb();
  process.env.DATABASE_URL = db.databaseUrl;
  ({ runRedcareKeywordTracking } = await import("../../src/jobs/redcareKeywordTracking.job"));
  server.listen({ onUnhandledRequest: "error" });
}, 60_000);

afterAll(async () => { server.close(); await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });
afterEach(() => server.resetHandlers());

describe("runRedcareKeywordTracking", () => {
  it("makes one HTTP request per unique market+keyword and writes a snapshot for every active watch on it", async () => {
    const ownWatch = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "diosmina esperidina", ean: "8057808520034", label: null, isOwn: true,
    });
    const competitorWatch = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "diosmina esperidina", ean: "8054346340155", label: "Competitor", isOwn: false,
    });

    let requestCount = 0;
    server.use(
      redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
        { ean: "8057808520034", productName: "Deiscente VENAVIL", price: 1190, best_offer: { seller: { name: "NATURPLAN" }, type: "MIRAKL" }, _rankingInfo: {} },
        { ean: "8054346340155", productName: "VitaminPure", price: 1990, best_offer: { seller: { name: "VitaminPure" }, type: "OTHER" }, _rankingInfo: { promoted: true } },
      ], 29, () => { requestCount++; }),
    );

    const result = await runRedcareKeywordTracking();

    expect(result).toEqual({ checked: 2, errors: 0 });
    expect(requestCount).toBe(1);

    const ownSnap = await findLatestSnapshot(db.prisma, ownWatch.id);
    expect(ownSnap).toMatchObject({ found: true, position: 1 });
    const compSnap = await findLatestSnapshot(db.prisma, competitorWatch.id);
    expect(compSnap).toMatchObject({ found: true, position: 2 });
  });

  it("records found=false for a tracked ean absent from the results, and isolates a per-keyword failure", async () => {
    const notFoundWatch = await createOrReactivateWatch(db.prisma, {
      market: "IT", keyword: "keyword ok", ean: "999", label: null, isOwn: true,
    });
    const brokenWatch = await createOrReactivateWatch(db.prisma, {
      market: "DE", keyword: "keyword broken", ean: "1", label: null, isOwn: true,
    });

    server.use(
      redcareSearchMocks.searchPage("IT", "products_mktplc_prod_IT_it", [
        { ean: "8057808520034", productName: "X", price: 1000, best_offer: { seller: { name: "Y" }, type: "MIRAKL" }, _rankingInfo: {} },
      ], 1),
      redcareSearchMocks.httpError("DE", 500),
    );

    const result = await runRedcareKeywordTracking();

    expect(result).toEqual({ checked: 1, errors: 1 });
    expect(await findLatestSnapshot(db.prisma, notFoundWatch.id)).toMatchObject({ found: false, position: null });
    expect(await findLatestSnapshot(db.prisma, brokenWatch.id)).toBeNull();
  });
});
