// purchasing/routes/payment-dues.routes.ts — list supplier payment dues, mark one paid.
import { Router, Request, Response } from "express";
import type { SupplierPaymentDueStatus } from "@prisma/client";
import { prisma } from "../../db";
import { findAllPaymentDues, markPaymentDuePaid } from "../../repositories/purchasing/payment-dues.repo";

export const paymentDuesRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

paymentDuesRouter.get("/payment-dues", async (req: Request, res: Response) => {
  try {
    const { status, supplierId } = req.query as Record<string, string>;
    const dues = await findAllPaymentDues(prisma, {
      status: (status as SupplierPaymentDueStatus) || undefined,
      supplierId: supplierId || undefined,
    });
    res.json(dues);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

paymentDuesRouter.post("/payment-dues/:id/mark-paid", async (req: Request, res: Response) => {
  try {
    const { paidDate, paidAmount } = req.body ?? {};
    if (!paidDate || paidAmount === undefined) {
      return res.status(400).json({ error: "paidDate and paidAmount required" });
    }
    const due = await markPaymentDuePaid(prisma, req.params.id, new Date(paidDate), Number(paidAmount));
    res.json(due);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Payment due not found" });
    res.status(500).json({ error: String(err) });
  }
});
