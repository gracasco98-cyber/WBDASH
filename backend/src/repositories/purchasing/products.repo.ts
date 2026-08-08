// repositories/purchasing/products.repo.ts — read-only projection of Product for
// the purchase-order line picker. Company-wide. Deliberately separate from
// repositories/amazon/product.repo.ts's findAllProducts (which includes full
// ProductIdentifier relations not needed here) to keep this query minimal for
// a picker that runs on every search keystroke.
import type { PrismaClient } from "@prisma/client";

export interface PickerProduct {
  id: string;
  name: string;
  brand: string | null;
}

export async function listActiveProductsForPicker(prisma: PrismaClient): Promise<PickerProduct[]> {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, brand: true },
    orderBy: { name: "asc" },
  });
}
