// repositories/purchasing/bank-accounts.repo.ts — Company-wide, no amazonAccountId.
// No bank credentials are ever stored here — only IBAN/BIC for identification.
import type { PrismaClient, BankAccount } from "@prisma/client";

export async function findAllBankAccounts(prisma: PrismaClient): Promise<BankAccount[]> {
  return prisma.bankAccount.findMany({ orderBy: { alias: "asc" } });
}

export interface CreateBankAccountInput {
  bankName: string;
  alias: string;
  accountHolder: string;
  iban: string;
  bic?: string | null;
  currency?: string;
  openingBalance: number;
  openingBalanceDate: Date;
  accountingCode?: string | null;
  notes?: string | null;
}

export async function createBankAccount(prisma: PrismaClient, data: CreateBankAccountInput): Promise<BankAccount> {
  return prisma.bankAccount.create({ data });
}

export async function updateBankAccount(
  prisma: PrismaClient,
  id: string,
  data: Partial<{ bankName: string; alias: string; accountHolder: string; bic: string | null; accountingCode: string | null; notes: string | null }>
): Promise<BankAccount> {
  return prisma.bankAccount.update({ where: { id }, data });
}

export async function deactivateBankAccount(prisma: PrismaClient, id: string): Promise<BankAccount> {
  return prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
}
