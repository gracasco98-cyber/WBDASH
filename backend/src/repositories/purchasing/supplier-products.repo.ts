// repositories/purchasing/supplier-products.repo.ts — Company-wide, no amazonAccountId.
// standardPrice is a denormalized cache of the latest SupplierProductPriceHistory
// row, kept in sync inside the same transaction — never edited independently.
import type { PrismaClient, SupplierProduct } from "@prisma/client";

export interface AddSupplierProductInput {
  productId: string;
  supplierSku?: string | null;
  supplierProductName?: string | null;
  standardPrice: number;
  currency?: string;
  moq?: number | null;
  orderMultiple?: number | null;
  leadTimeDays?: number | null;
  unitsPerCarton?: number | null;
  unitsPerPallet?: number | null;
  weightKg?: number | null;
  conditions?: string | null;
  isPreferredSupplier?: boolean;
  notes?: string | null;
}

export async function findProductsForSupplier(prisma: PrismaClient, supplierId: string) {
  return prisma.supplierProduct.findMany({
    where: { supplierId },
    include: { priceHistory: { orderBy: { validFrom: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addSupplierProduct(
  prisma: PrismaClient,
  supplierId: string,
  data: AddSupplierProductInput
): Promise<SupplierProduct> {
  const now = new Date();
  const currency = data.currency ?? "EUR";
  return prisma.supplierProduct.create({
    data: {
      supplierId,
      productId: data.productId,
      supplierSku: data.supplierSku ?? null,
      supplierProductName: data.supplierProductName ?? null,
      standardPrice: data.standardPrice,
      currency,
      moq: data.moq ?? null,
      orderMultiple: data.orderMultiple ?? null,
      leadTimeDays: data.leadTimeDays ?? null,
      unitsPerCarton: data.unitsPerCarton ?? null,
      unitsPerPallet: data.unitsPerPallet ?? null,
      weightKg: data.weightKg ?? null,
      conditions: data.conditions ?? null,
      lastPriceDate: now,
      isPreferredSupplier: data.isPreferredSupplier ?? false,
      notes: data.notes ?? null,
      priceHistory: {
        create: { price: data.standardPrice, currency, validFrom: now, source: "initial" },
      },
    },
  });
}

// Currency is resolved to a single value BEFORE the transaction runs, and that
// same resolved value is written to both the new history row and the parent
// SupplierProduct. Previously this used two independent defaults
// (`?? "EUR"` for history vs. `?? undefined` / "leave unchanged" for the
// parent), which could diverge for a non-EUR supplier product: an
// omitted `currency` would silently stamp the append-only history row with
// "EUR" while the parent kept its real currency (e.g. "USD") — a permanent,
// uncorrectable wrong-currency entry in financial history. Resolving once
// and reusing the same value everywhere makes that divergence impossible.
export async function updateSupplierProductPrice(
  prisma: PrismaClient,
  supplierProductId: string,
  data: { price: number; currency?: string; source: string; note?: string }
): Promise<SupplierProduct> {
  const now = new Date();
  let currency = data.currency;
  if (!currency) {
    const existing = await prisma.supplierProduct.findUniqueOrThrow({
      where: { id: supplierProductId },
      select: { currency: true },
    });
    currency = existing.currency;
  }
  const [, updated] = await prisma.$transaction([
    prisma.supplierProductPriceHistory.create({
      data: { supplierProductId, price: data.price, currency, validFrom: now, source: data.source, note: data.note ?? null },
    }),
    prisma.supplierProduct.update({
      where: { id: supplierProductId },
      data: { standardPrice: data.price, currency, lastPriceDate: now },
    }),
  ]);
  return updated;
}

export async function updateSupplierProductDetails(
  prisma: PrismaClient,
  supplierProductId: string,
  data: Partial<Omit<AddSupplierProductInput, "productId" | "standardPrice" | "currency">>
): Promise<SupplierProduct> {
  return prisma.supplierProduct.update({ where: { id: supplierProductId }, data });
}

export async function removeSupplierProduct(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.supplierProduct.delete({ where: { id } });
}
