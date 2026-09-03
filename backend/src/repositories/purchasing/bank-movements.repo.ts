import type { PrismaClient } from "@prisma/client";

export type BankMovementFilters = {
  bankAccountId?: string;
  from?: Date;
  to?: Date;
  status?: string;
  category?: string;
  search?: string;
};

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function whereFor(filters: BankMovementFilters) {
  return {
    ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.search ? { OR: [
      { description: { contains: filters.search, mode: "insensitive" as const } },
      { counterparty: { contains: filters.search, mode: "insensitive" as const } },
      { documentNumber: { contains: filters.search, mode: "insensitive" as const } },
    ] } : {}),
    ...(filters.from || filters.to ? { movementDate: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    } } : {}),
  };
}

export async function listBankMovements(prisma: PrismaClient, filters: BankMovementFilters) {
  const rows = await prisma.bankMovement.findMany({
    where: whereFor(filters),
    include: { bankAccount: true, attachments: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
  });

  const accountIds = filters.bankAccountId ? [filters.bankAccountId] : [...new Set(rows.map(row => row.bankAccountId))];
  const accounts = await prisma.bankAccount.findMany({ where: { id: { in: accountIds } } });
  const openingByBank = new Map(accounts.map(account => [account.id, toNumber(account.openingBalance)]));

  // Running balances are derived from opening balance + (Avere - Dare), making
  // the daily balance auditable and independent of any UI aggregation.
  const before = await prisma.bankMovement.findMany({
    where: {
      ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
      ...(filters.from ? { movementDate: { lt: filters.from } } : {}),
    },
    select: { bankAccountId: true, dare: true, avere: true },
  });
  const running = new Map<string, number>(openingByBank);
  for (const row of before) running.set(row.bankAccountId, (running.get(row.bankAccountId) ?? 0) + toNumber(row.avere) - toNumber(row.dare));

  const movements = rows.map(row => {
    const balance = (running.get(row.bankAccountId) ?? 0) + toNumber(row.avere) - toNumber(row.dare);
    running.set(row.bankAccountId, balance);
    return {
      ...row,
      dare: toNumber(row.dare),
      avere: toNumber(row.avere),
      balanceAfter: balance,
      vatRate: row.vatRate == null ? null : toNumber(row.vatRate),
      bankAccount: { ...row.bankAccount, openingBalance: toNumber(row.bankAccount.openingBalance) },
    };
  });

  const totalDare = movements.reduce((sum, row) => sum + row.dare, 0);
  const totalAvere = movements.reduce((sum, row) => sum + row.avere, 0);
  const closingByBank = new Map<string, number>();
  for (const [id, balance] of running) closingByBank.set(id, balance);
  const daily = new Map<string, { date: string; dare: number; avere: number; net: number; closingBalance: number }>();
  for (const row of movements) {
    const date = row.movementDate.toISOString().slice(0, 10);
    const current = daily.get(date) ?? { date, dare: 0, avere: 0, net: 0, closingBalance: 0 };
    current.dare += row.dare; current.avere += row.avere; current.net += row.avere - row.dare;
    current.closingBalance = filters.bankAccountId ? row.balanceAfter : current.closingBalance + row.avere - row.dare;
    daily.set(date, current);
  }
  return {
    movements,
    summary: {
      totalDare,
      totalAvere,
      net: totalAvere - totalDare,
      closingBalance: [...closingByBank.values()].reduce((sum, value) => sum + value, 0),
      unreconciled: movements.filter(row => row.status !== "RICONCILIATO").length,
      daily: [...daily.values()],
    },
  };
}

export async function createBankMovement(prisma: PrismaClient, data: {
  bankAccountId: string; movementDate: Date; description: string; dare?: number; avere?: number;
  counterparty?: string | null; category?: string | null; documentNumber?: string | null;
  status?: string; vatRate?: number | null; accountingCode?: string | null; notes?: string | null;
  isRecurring?: boolean; recurrenceRule?: string | null; createdBy?: string | null;
}) {
  if ((data.dare ?? 0) < 0 || (data.avere ?? 0) < 0 || ((data.dare ?? 0) > 0 && (data.avere ?? 0) > 0) || ((data.dare ?? 0) === 0 && (data.avere ?? 0) === 0)) {
    throw new Error("Exactly one positive value is required between dare and avere");
  }
  return prisma.bankMovement.create({ data: { ...data, dare: data.dare ?? 0, avere: data.avere ?? 0 } });
}
