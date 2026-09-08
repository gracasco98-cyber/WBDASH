// purchasing/routes/supplier-invoices.routes.ts — FASE G: list/create/void
// supplier invoices. See repositories/purchasing/supplier-invoices.repo.ts
// for the financialStatus side effect on the linked order.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  createSupplierInvoice,
  findAllSupplierInvoices,
  findSupplierInvoiceById,
  voidSupplierInvoice,
} from "../../repositories/purchasing/supplier-invoices.repo";

export const supplierInvoicesRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}
function duplicate(err: unknown): boolean {
  return (err as any)?.code === "P2002";
}

supplierInvoicesRouter.get("/supplier-invoices", async (req: Request, res: Response) => {
  try {
    const { supplierId, purchaseOrderId, includeVoided } = req.query as Record<string, string>;
    const invoices = await findAllSupplierInvoices(prisma, {
      supplierId: supplierId || undefined,
      purchaseOrderId: purchaseOrderId || undefined,
      includeVoided: includeVoided === "true",
    });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.get("/supplier-invoices/:id", async (req: Request, res: Response) => {
  try {
    const invoice = await findSupplierInvoiceById(prisma, req.params.id);
    res.json(invoice);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Fattura non trovata" });
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.post("/supplier-invoices", async (req: Request, res: Response) => {
  try {
    const { supplierId, purchaseOrderId, invoiceNumber, invoiceDate, taxableAmount, vatAmount, totalAmount, notes } = req.body ?? {};
    if (!supplierId || !invoiceNumber || !invoiceDate || taxableAmount === undefined || vatAmount === undefined || totalAmount === undefined) {
      return res.status(400).json({ error: "supplierId, invoiceNumber, invoiceDate, taxableAmount, vatAmount, totalAmount sono richiesti" });
    }
    const invoice = await createSupplierInvoice(prisma, {
      supplierId,
      purchaseOrderId: purchaseOrderId || null,
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      taxableAmount: Number(taxableAmount),
      vatAmount: Number(vatAmount),
      totalAmount: Number(totalAmount),
      notes: notes || null,
    }, req.user!.id);
    res.status(201).json(invoice);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: "Esiste già una fattura con questo numero per questo fornitore" });
    if ((err as any)?.code === "P2003") return res.status(404).json({ error: "Fornitore o ordine collegato non trovato" });
    const message = String((err as any)?.message ?? err);
    if (/PURCHASE_ORDER_SUPPLIER_MISMATCH/.test(message)) return res.status(400).json({ error: "L'ordine di acquisto collegato non appartiene al fornitore indicato" });
    res.status(500).json({ error: String(err) });
  }
});

supplierInvoicesRouter.post("/supplier-invoices/:id/void", async (req: Request, res: Response) => {
  try {
    const invoice = await voidSupplierInvoice(prisma, req.params.id);
    res.json(invoice);
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Fattura non trovata" });
    res.status(500).json({ error: String(err) });
  }
});
