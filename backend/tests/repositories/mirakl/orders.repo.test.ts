import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import {
  findByMiraklOrderId,
  findByShopifyOrderId,
  createPendingAcceptOrder,
  markAccepted,
  markShipped,
  InvalidMiraklTransitionError,
} from "../../../src/repositories/mirakl/orders.repo";

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await truncateAll(db.prisma);
});

describe("createPendingAcceptOrder / findByMiraklOrderId", () => {
  it("creates a row with miraklState=PENDING_ACCEPT", async () => {
    const row = await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-1",
      shopifyOrderId: "gid://shopify/Order/1",
      country: "IT",
    });
    expect(row.miraklState).toBe("PENDING_ACCEPT");

    const found = await findByMiraklOrderId(db.prisma, "MK-1");
    expect(found?.shopifyOrderId).toBe("gid://shopify/Order/1");
  });

  it("returns null when not found", async () => {
    const found = await findByMiraklOrderId(db.prisma, "MISSING");
    expect(found).toBeNull();
  });
});

describe("markAccepted / markShipped", () => {
  it("transitions PENDING_ACCEPT -> ACCEPTED -> SHIPPED", async () => {
    await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-2",
      shopifyOrderId: "gid://shopify/Order/2",
      country: "DE",
    });

    const accepted = await markAccepted(db.prisma, "MK-2");
    expect(accepted.miraklState).toBe("ACCEPTED");

    const shipped = await markShipped(db.prisma, "gid://shopify/Order/2", "TRACK-123");
    expect(shipped.miraklState).toBe("SHIPPED");
    expect(shipped.trackingNumber).toBe("TRACK-123");
    expect(shipped.trackingSyncedAt).not.toBeNull();

    const byShopifyId = await findByShopifyOrderId(db.prisma, "gid://shopify/Order/2");
    expect(byShopifyId?.miraklState).toBe("SHIPPED");
  });
});

describe("Invalid state transitions", () => {
  it("markAccepted throws InvalidMiraklTransitionError when not in PENDING_ACCEPT state", async () => {
    // Create and transition order to ACCEPTED
    await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-3",
      shopifyOrderId: "gid://shopify/Order/3",
      country: "IT",
    });
    await markAccepted(db.prisma, "MK-3");

    // Try to mark as accepted again (already ACCEPTED)
    await expect(markAccepted(db.prisma, "MK-3")).rejects.toThrow(InvalidMiraklTransitionError);
    await expect(markAccepted(db.prisma, "MK-3")).rejects.toThrow(
      /Transizione MiraklOrder non valida: ACCEPTED → ACCEPTED/
    );
  });

  it("markShipped throws InvalidMiraklTransitionError when not in ACCEPTED state", async () => {
    // Create order in PENDING_ACCEPT state
    await createPendingAcceptOrder(db.prisma, {
      miraklOrderId: "MK-4",
      shopifyOrderId: "gid://shopify/Order/4",
      country: "DE",
    });

    // Try to ship without accepting first
    await expect(
      markShipped(db.prisma, "gid://shopify/Order/4", "TRACK-123")
    ).rejects.toThrow(InvalidMiraklTransitionError);
    await expect(
      markShipped(db.prisma, "gid://shopify/Order/4", "TRACK-123")
    ).rejects.toThrow(/Transizione MiraklOrder non valida: PENDING_ACCEPT → SHIPPED/);
  });
});
