// repositories/purchasing/document-sequence.repo.ts — Atomic document numbering.
// Company-wide. Reused by any purchasing document needing a sequential
// human-readable number (PurchaseOrder now; GoodsReceipt/SupplierInvoice in
// later phases reuse this with a different documentType).
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Atomically increments and returns the next sequence value for
 * (documentType, year), creating the row with lastValue=1 on first use.
 * Single INSERT...ON CONFLICT...RETURNING statement — no read-then-write
 * race window, safe under concurrent callers without an explicit lock.
 * Pass a transaction client so the caller's document creation commits or
 * rolls back atomically together with the number it consumed.
 */
export async function nextSequenceValue(
  tx: PrismaClient | Prisma.TransactionClient,
  documentType: string,
  year: number
): Promise<number> {
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" (id, "documentType", year, "lastValue", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${documentType}, ${year}, 1, now(), now())
    ON CONFLICT ("documentType", year)
    DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1, "updatedAt" = now()
    RETURNING "lastValue"
  `;
  return rows[0].lastValue;
}

export function formatPoNumber(year: number, value: number): string {
  return `PO-${year}-${String(value).padStart(6, "0")}`;
}

export function formatGrnNumber(year: number, value: number): string {
  return `GR-${year}-${String(value).padStart(6, "0")}`;
}
