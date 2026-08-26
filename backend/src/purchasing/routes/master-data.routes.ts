// purchasing/routes/master-data.routes.ts — Warehouse, PaymentTerm, BankAccount CRUD.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findAllWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from "../../repositories/purchasing/warehouses.repo";
import { findAllPaymentTerms, createPaymentTerm, updatePaymentTerm, deactivatePaymentTerm } from "../../repositories/purchasing/payment-terms.repo";
import { findAllBankAccounts, createBankAccount, updateBankAccount, deactivateBankAccount } from "../../repositories/purchasing/bank-accounts.repo";

export const masterDataRouter = Router();

// ─── Warehouses ──────────────────────────────────────────────────────────────
masterDataRouter.get("/warehouses", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllWarehouses(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/warehouses", async (req: Request, res: Response) => {
  try {
    const { name, code, address } = req.body ?? {};
    if (!name || !code) return res.status(400).json({ error: "name and code required" });
    res.json(await createWarehouse(prisma, { name, code, address: address ?? null }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.put("/warehouses/:id", async (req: Request, res: Response) => {
  try {
    const { name, address } = req.body ?? {};
    res.json(await updateWarehouse(prisma, req.params.id, { name, address }));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "Warehouse not found" });
    res.status(500).json({ error: String(err) });
  }
});

masterDataRouter.delete("/warehouses/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateWarehouse(prisma, req.params.id));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "Warehouse not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Payment terms ───────────────────────────────────────────────────────────
masterDataRouter.get("/payment-terms", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllPaymentTerms(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/payment-terms", async (req: Request, res: Response) => {
  try {
    const { name, type, endOfMonth, fixedDay, paymentMethod, installments } = req.body ?? {};
    if (!name || !type || !paymentMethod || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: "name, type, paymentMethod, installments[] required" });
    }
    const term = await createPaymentTerm(prisma, { name, type, endOfMonth: !!endOfMonth, fixedDay: fixedDay ?? null, paymentMethod, installments });
    res.json(term);
  } catch (err) {
    // Only the installment-sum validation error from the repo layer maps to 400;
    // anything else (e.g. a DB outage) is a genuine 500.
    const message = err instanceof Error ? err.message : String(err);
    if (/sum to 100/.test(message)) return res.status(400).json({ error: message });
    res.status(500).json({ error: message });
  }
});

masterDataRouter.put("/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    const { name, type, endOfMonth, fixedDay, paymentMethod, installments } = req.body ?? {};
    if (!name || !type || !paymentMethod || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: "name, type, paymentMethod, installments[] required" });
    }
    const term = await updatePaymentTerm(prisma, req.params.id, {
      name, type, endOfMonth: !!endOfMonth, fixedDay: fixedDay ?? null, paymentMethod, installments,
    });
    res.json(term);
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "PaymentTerm not found" });
    const message = err instanceof Error ? err.message : String(err);
    if (/sum to 100/.test(message)) return res.status(400).json({ error: message });
    res.status(500).json({ error: message });
  }
});

masterDataRouter.delete("/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivatePaymentTerm(prisma, req.params.id));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "PaymentTerm not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Bank accounts ───────────────────────────────────────────────────────────
masterDataRouter.get("/bank-accounts", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllBankAccounts(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.post("/bank-accounts", async (req: Request, res: Response) => {
  try {
    const { bankName, alias, accountHolder, iban, bic, currency, openingBalance, openingBalanceDate, accountingCode, notes } = req.body ?? {};
    if (!bankName || !alias || !accountHolder || !iban || openingBalance === undefined || !openingBalanceDate) {
      return res.status(400).json({ error: "bankName, alias, accountHolder, iban, openingBalance, openingBalanceDate required" });
    }
    const acc = await createBankAccount(prisma, {
      bankName, alias, accountHolder, iban, bic: bic ?? null, currency: currency ?? "EUR",
      openingBalance: Number(openingBalance), openingBalanceDate: new Date(openingBalanceDate),
      accountingCode: accountingCode ?? null, notes: notes ?? null,
    });
    res.json(acc);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

masterDataRouter.put("/bank-accounts/:id", async (req: Request, res: Response) => {
  try {
    const { bankName, alias, accountHolder, bic, accountingCode, notes } = req.body ?? {};
    res.json(await updateBankAccount(prisma, req.params.id, { bankName, alias, accountHolder, bic, accountingCode, notes }));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BankAccount not found" });
    res.status(500).json({ error: String(err) });
  }
});

masterDataRouter.delete("/bank-accounts/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateBankAccount(prisma, req.params.id));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BankAccount not found" });
    res.status(500).json({ error: String(err) });
  }
});
