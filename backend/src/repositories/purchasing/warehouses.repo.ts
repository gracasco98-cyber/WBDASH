// repositories/purchasing/warehouses.repo.ts — Company-wide, no amazonAccountId.
import type { PrismaClient, Warehouse } from "@prisma/client";

export async function findAllWarehouses(prisma: PrismaClient): Promise<Warehouse[]> {
  return prisma.warehouse.findMany({ orderBy: { name: "asc" } });
}

export async function createWarehouse(
  prisma: PrismaClient,
  data: { name: string; code: string; address?: string | null }
): Promise<Warehouse> {
  return prisma.warehouse.create({ data });
}

export async function updateWarehouse(
  prisma: PrismaClient,
  id: string,
  data: Partial<{ name: string; address: string | null }>
): Promise<Warehouse> {
  return prisma.warehouse.update({ where: { id }, data });
}

export async function deactivateWarehouse(prisma: PrismaClient, id: string): Promise<Warehouse> {
  return prisma.warehouse.update({ where: { id }, data: { isActive: false } });
}
