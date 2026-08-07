// repositories/purchasing/supplier-contacts.repo.ts — Company-wide, no amazonAccountId.
// Hard-deletable by design: a contact carries no financial/history significance
// (see plan Global Constraints for the reasoning behind this module-wide exception).
import type { PrismaClient, SupplierContact } from "@prisma/client";

export interface CreateContactInput {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export async function createContact(
  prisma: PrismaClient,
  supplierId: string,
  data: CreateContactInput
): Promise<SupplierContact> {
  return prisma.supplierContact.create({ data: { ...data, supplierId } });
}

export async function updateContact(
  prisma: PrismaClient,
  id: string,
  data: Partial<CreateContactInput>
): Promise<SupplierContact> {
  return prisma.supplierContact.update({ where: { id }, data });
}

export async function deleteContact(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.supplierContact.delete({ where: { id } });
}
