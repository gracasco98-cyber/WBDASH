// repositories/purchasing/suppliers.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, Supplier, SupplierContact, SupplierProduct, SupplierProductPriceHistory, PurchasePaymentMethod, Product } from "@prisma/client";

export type SupplierWithRelations = Supplier & {
  contacts: SupplierContact[];
  products: (SupplierProduct & { priceHistory: SupplierProductPriceHistory[]; product: Product })[];
};

export async function findAllSuppliers(prisma: PrismaClient) {
  return prisma.supplier.findMany({
    orderBy: { legalName: "asc" },
    include: {
      defaultPaymentTerm: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });
}

export async function findSupplierById(prisma: PrismaClient, id: string): Promise<SupplierWithRelations | null> {
  return prisma.supplier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { isPrimary: "desc" } },
      products: { include: { priceHistory: { orderBy: { validFrom: "desc" } }, product: true } },
    },
  });
}

export interface CreateSupplierInput {
  legalName: string;
  tradeName?: string | null;
  internalCode: string;
  supplierType: string;
  country: string;
  language?: string | null;
  defaultCurrency?: string;
  vatNumber?: string | null;
  taxCode?: string | null;
  foreignVatNumber?: string | null;
  sdiCode?: string | null;
  pec?: string | null;
  taxRegime?: string | null;
  fiscalNotes?: string | null;
  addressLine?: string | null;
  streetNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  addressCountry?: string | null;
  defaultPaymentMethod?: PurchasePaymentMethod | null;
  defaultPaymentTermId?: string | null;
  paymentDays?: number | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  ribaEnabled?: boolean;
  fixedPaymentDays?: number[];
}

export async function createSupplier(prisma: PrismaClient, data: CreateSupplierInput): Promise<Supplier> {
  return prisma.supplier.create({ data });
}

export async function updateSupplier(
  prisma: PrismaClient,
  id: string,
  data: Partial<Omit<CreateSupplierInput, "internalCode">>
): Promise<Supplier> {
  return prisma.supplier.update({ where: { id }, data });
}

export async function deactivateSupplier(prisma: PrismaClient, id: string): Promise<Supplier> {
  return prisma.supplier.update({ where: { id }, data: { isActive: false } });
}
