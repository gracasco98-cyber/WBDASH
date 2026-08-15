// purchasing/routes/goods-receipts.routes.ts — GoodsReceipt creation + listing, nested under a purchase order.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { createGoodsReceipt, findGoodsReceiptsByOrderId, OverReceiptError, ForeignLineError } from "../../repositories/purchasing/goods-receipts.repo";
import { InvalidTransitionError } from "../../repositories/purchasing/purchase-orders.repo";

export const goodsReceiptsRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

interface GoodsReceiptLineInput {
  purchaseOrderLineId: string;
  receivedQty: number;
  notes?: string;
}

goodsReceiptsRouter.get("/purchase-orders/:id/goods-receipts", async (req: Request, res: Response) => {
  try {
    res.json(await findGoodsReceiptsByOrderId(prisma, req.params.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

goodsReceiptsRouter.post("/purchase-orders/:id/goods-receipts", async (req: Request, res: Response) => {
  try {
    const { receiptDate, supplierDdtNumber, supplierDdtDate, carrier, notes, lines } = req.body ?? {};
    if (!receiptDate || !supplierDdtNumber || !supplierDdtDate) {
      return res.status(400).json({ error: "receiptDate, supplierDdtNumber, supplierDdtDate required" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "At least one line is required" });
    }
    for (const l of lines as GoodsReceiptLineInput[]) {
      if (!l.purchaseOrderLineId || !l.receivedQty || l.receivedQty <= 0) {
        return res.status(400).json({ error: "Each line requires purchaseOrderLineId and a positive receivedQty" });
      }
    }

    const gr = await createGoodsReceipt(prisma, {
      purchaseOrderId: req.params.id,
      receiptDate: new Date(receiptDate),
      supplierDdtNumber, supplierDdtDate: new Date(supplierDdtDate),
      carrier: carrier ?? null, notes: notes ?? null,
      receivedById: req.user!.id,
      lines: (lines as GoodsReceiptLineInput[]).map((l) => ({
        purchaseOrderLineId: l.purchaseOrderLineId, receivedQty: Number(l.receivedQty), notes: l.notes ?? null,
      })),
    });
    res.status(201).json(gr);
  } catch (err) {
    if (err instanceof OverReceiptError) return res.status(409).json({ error: err.message });
    if (err instanceof InvalidTransitionError) return res.status(409).json({ error: err.message });
    if (err instanceof ForeignLineError) return res.status(400).json({ error: err.message });
    if (notFound(err)) return res.status(404).json({ error: "Purchase order not found" });
    res.status(500).json({ error: String(err) });
  }
});
