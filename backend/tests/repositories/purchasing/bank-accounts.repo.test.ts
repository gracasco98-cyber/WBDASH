import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, type TestDb } from "../../helpers/db";
import { findAllBankAccounts, createBankAccount, updateBankAccount, deactivateBankAccount } from "../../../src/repositories/purchasing/bank-accounts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("bank-accounts.repo", () => {
  it("creates a bank account with an opening balance and finds it", async () => {
    await createBankAccount(db.prisma, {
      bankName: "Intesa Sanpaolo", alias: "Intesa WEBPLAN", accountHolder: "WBDASH SRL",
      iban: "IT60X0542811101000000123456", openingBalance: 10000, openingBalanceDate: new Date("2026-01-01"),
    });
    const all = await findAllBankAccounts(db.prisma);
    expect(all).toHaveLength(1);
    expect(Number(all[0].openingBalance)).toBe(10000);
  });

  it("rejects a duplicate IBAN", async () => {
    const iban = "IT60X0542811101000000999999";
    await createBankAccount(db.prisma, { bankName: "A", alias: "A", accountHolder: "X", iban, openingBalance: 0, openingBalanceDate: new Date() });
    await expect(createBankAccount(db.prisma, { bankName: "B", alias: "B", accountHolder: "Y", iban, openingBalance: 0, openingBalanceDate: new Date() })).rejects.toThrow();
  });

  it("updates alias/notes without touching IBAN or opening balance", async () => {
    const acc = await createBankAccount(db.prisma, {
      bankName: "Revolut", alias: "Old Alias", accountHolder: "WBDASH SRL",
      iban: "GB29NWBK60161331926819", openingBalance: 500, openingBalanceDate: new Date("2026-02-01"),
    });
    const updated = await updateBankAccount(db.prisma, acc.id, { alias: "Revolut WEBPLAN", notes: "Conto secondario" });
    expect(updated.alias).toBe("Revolut WEBPLAN");
    expect(updated.iban).toBe("GB29NWBK60161331926819");
    expect(Number(updated.openingBalance)).toBe(500);
  });

  it("deactivate sets isActive=false instead of deleting the row", async () => {
    const acc = await createBankAccount(db.prisma, {
      bankName: "Cassa", alias: "Cassa Contanti", accountHolder: "WBDASH SRL",
      iban: "IT00CASH00000000000000001", openingBalance: 0, openingBalanceDate: new Date(),
    });
    await deactivateBankAccount(db.prisma, acc.id);
    const row = await db.prisma.bankAccount.findUnique({ where: { id: acc.id } });
    expect(row!.isActive).toBe(false);
  });
});
