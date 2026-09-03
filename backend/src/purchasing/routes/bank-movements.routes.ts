import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { createBankMovement, listBankMovements } from "../../repositories/purchasing/bank-movements.repo";

export const bankMovementsRouter = Router();

function dateParam(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(`${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

bankMovementsRouter.get("/bank-movements", async (req: Request, res: Response) => {
  try {
    const result = await listBankMovements(prisma, {
      bankAccountId: typeof req.query.bankAccountId === "string" ? req.query.bankAccountId : undefined,
      from: dateParam(req.query.from), to: dateParam(req.query.to, true),
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

bankMovementsRouter.post("/bank-movements", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    if (!body.bankAccountId || !body.movementDate || !body.description) {
      return res.status(400).json({ error: "bankAccountId, movementDate and description required" });
    }
    const movement = await createBankMovement(prisma, {
      bankAccountId: body.bankAccountId,
      movementDate: new Date(body.movementDate), description: body.description,
      dare: body.dare === undefined ? 0 : Number(body.dare), avere: body.avere === undefined ? 0 : Number(body.avere),
      counterparty: body.counterparty ?? null, category: body.category ?? null,
      documentNumber: body.documentNumber ?? null, status: body.status ?? "BOZZA",
      vatRate: body.vatRate == null ? null : Number(body.vatRate),
      accountingCode: body.accountingCode ?? null, notes: body.notes ?? null,
      isRecurring: !!body.isRecurring, recurrenceRule: body.recurrenceRule ?? null,
      createdBy: (req as Request & { user?: { id?: string } }).user?.id ?? null,
    });
    res.status(201).json(movement);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Exactly one positive/.test(message)) return res.status(400).json({ error: message });
    res.status(500).json({ error: message });
  }
});
