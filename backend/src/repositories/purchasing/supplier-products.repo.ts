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

export async function updateSupplierProductPrice(
  prisma: PrismaClient,
  supplierProductId: string,
  data: { price: number; currency?: string; source: string; note?: string }
): Promise<SupplierProduct> {
  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.supplierProductPriceHistory.create({
      data: { supplierProductId, price: data.price, currency: data.currency ?? "EUR", validFrom: now, source: data.source, note: data.note ?? null },
    }),
    prisma.supplierProduct.update({
      where: { id: supplierProductId },
      data: { standardPrice: data.price, currency: data.currency ?? undefined, lastPriceDate: now },
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
