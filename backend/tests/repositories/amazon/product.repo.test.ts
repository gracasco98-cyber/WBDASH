import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { runWithAccount } from "../../../src/context/account-context";
import {
  createProduct, createIdentifier, findAllProducts, findProductById,
  moveIdentifier, renameProduct, findProductsByIdentifierSkus,
} from "../../../src/repositories/amazon/product.repo";

let db: TestDb;
let accountId: string;

beforeAll(async () => { db = await setupTestDb(); });
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => {
  await truncateAll(db.prisma);
  accountId = await createTestAmazonAccount(db.prisma);
});

describe("product.repo", () => {
  it("creates a product with no identifiers", async () => {
    await runWithAccount(accountId, async () => {
      const p = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      expect(p.name).toBe("Resveratrolo 500mg");
      expect(p.status).toBe("ACTIVE");
      expect(p.identifiers).toEqual([]);
    });
  });

  it("attaches identifiers and returns them via findProductById", async () => {
    await runWithAccount(accountId, async () => {
      const p = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: p.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
      await createIdentifier(db.prisma, { productId: p.id, channelType: "AMAZON", marketplace: "DE", asin: "B0DEF456", sku: "SKU-RSV-01" });
      const found = await findProductById(db.prisma, p.id);
      expect(found?.identifiers).toHaveLength(2);
      expect(found?.identifiers.map(i => i.asin).sort()).toEqual(["B0ABC123", "B0DEF456"]);
    });
  });

  it("finds products by identifier SKU, across marketplaces", async () => {
    await runWithAccount(accountId, async () => {
      const p = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      await createIdentifier(db.prisma, { productId: p.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
      const found = await findProductsByIdentifierSkus(db.prisma, ["SKU-RSV-01", "NO-MATCH"]);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(p.id);
    });
  });

  it("moveIdentifier reassigns productId and archives an emptied source product", async () => {
    await runWithAccount(accountId, async () => {
      const source = await createProduct(db.prisma, { name: "Resveratrolo 250mg" });
      const target = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      const ident = await createIdentifier(db.prisma, { productId: source.id, channelType: "AMAZON", marketplace: "IT", asin: "B0GHI789", sku: "SKU-RSV-250" });

      await moveIdentifier(db.prisma, { identifierId: ident.id, targetProductId: target.id });

      const movedTarget = await findProductById(db.prisma, target.id);
      expect(movedTarget?.identifiers.map(i => i.id)).toEqual([ident.id]);

      const emptiedSource = await findProductById(db.prisma, source.id);
      expect(emptiedSource?.status).toBe("ARCHIVED");
    });
  });

  it("moveIdentifier does not archive a source product that still has other identifiers", async () => {
    await runWithAccount(accountId, async () => {
      const source = await createProduct(db.prisma, { name: "Resveratrolo 500mg" });
      const target = await createProduct(db.prisma, { name: "Other" });
      const identToMove = await createIdentifier(db.prisma, { productId: source.id, channelType: "AMAZON", marketplace: "IT", asin: "B0ABC123", sku: "SKU-RSV-01" });
      await createIdentifier(db.prisma, { productId: source.id, channelType: "AMAZON", marketplace: "DE", asin: "B0DEF456", sku: "SKU-RSV-01" });

      await moveIdentifier(db.prisma, { identifierId: identToMove.id, targetProductId: target.id });

      const stillActive = await findProductById(db.prisma, source.id);
      expect(stillActive?.status).toBe("ACTIVE");
      expect(stillActive?.identifiers).toHaveLength(1);
    });
  });

  it("renameProduct updates the name", async () => {
    await runWithAccount(accountId, async () => {
      const p = await createProduct(db.prisma, { name: "Old Name" });
      await renameProduct(db.prisma, { productId: p.id, name: "New Name" });
      const found = await findProductById(db.prisma, p.id);
      expect(found?.name).toBe("New Name");
    });
  });

  it("findAllProducts filters by status", async () => {
    await runWithAccount(accountId, async () => {
      const active = await createProduct(db.prisma, { name: "Active One" });
      const toArchive = await createProduct(db.prisma, { name: "Will Archive" });
      const target = await createProduct(db.prisma, { name: "Target" });
      const ident = await createIdentifier(db.prisma, { productId: toArchive.id, channelType: "AMAZON", marketplace: "IT", asin: "B0X", sku: "SKU-X" });
      await moveIdentifier(db.prisma, { identifierId: ident.id, targetProductId: target.id });

      const activeOnly = await findAllProducts(db.prisma, { status: "ACTIVE" });
      const activeIds = activeOnly.map(p => p.id);
      expect(activeIds).toContain(active.id);
      expect(activeIds).toContain(target.id);
      expect(activeIds).not.toContain(toArchive.id);
    });
  });
});
