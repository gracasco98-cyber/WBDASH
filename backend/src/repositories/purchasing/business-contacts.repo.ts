// repositories/purchasing/business-contacts.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, BusinessContact } from "@prisma/client";

export async function findAllBusinessContacts(prisma: PrismaClient): Promise<BusinessContact[]> {
  return prisma.businessContact.findMany({ orderBy: { name: "asc" } });
}

export interface CreateBusinessContactInput {
  type: string;
  name: string;
  referent?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createBusinessContact(
  prisma: PrismaClient,
  data: CreateBusinessContactInput
): Promise<BusinessContact> {
  return prisma.businessContact.create({ data });
}

export async function updateBusinessContact(
  prisma: PrismaClient,
  id: string,
  data: Partial<{
    name: string; referent: string | null; email: string | null;
    phone: string | null; address: string | null; notes: string | null;
  }>
): Promise<BusinessContact> {
  return prisma.businessContact.update({ where: { id }, data });
}

export async function deactivateBusinessContact(prisma: PrismaClient, id: string): Promise<BusinessContact> {
  return prisma.businessContact.update({ where: { id }, data: { isActive: false } });
}
