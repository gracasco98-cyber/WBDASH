// purchasing/routes/purchase-orders.routes.ts — PurchaseOrder CRUD + status transitions + product picker.
import { Router, Request, Response } from "express";
import type { PurchaseOrderLogisticStatus } from "@prisma/client";
import { prisma } from "../../db";
import {
  createPurchaseOrder, findAllPurchaseOrders, findPurchaseOrderById,
  transitionPurchaseOrderStatus, deletePurchaseOrder, InvalidTransitionError,
} from "../../repositories/purchasing/purchase-orders.repo";
import { listActiveProductsForPicker } from "../../repositories/purchasing/products.repo";

export const purchaseOrdersRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

// ─── Products (picker) ───────────────────────────────────────────────────────
purchaseOrdersRouter.get("/products", async (_req: Request, res: Response) => {
  try {
    res.json(await listActiveProductsForPicker(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Purchase orders ──────────────────────────────────────────────────────────
purchaseOrdersRouter.get("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const { logisticStatus, supplierId } = req.query as Record<string, string>;
    res.json(await findAllPurchaseOrders(prisma, {
      logisticStatus: (logisticStatus as PurchaseOrderLogisticStatus) || undefined,
      supplierId: supplierId || undefined,
    }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

purchaseOrdersRouter.get("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    const po = await findPurchaseOrderById(prisma, req.params.id);
    if (!po) return res.status(404).json({ error: "Purchase order not found" });
    res.json(po);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

interface LineInput {
  productId: string; supplierSku?: string; description: string; orderedQty: number;
  unitOfMeasure: string; unitPrice: number; discountPct?: number;
  taxableAmount: number; vatAmount: number; totalAmount: number;
}

purchaseOrdersRouter.post("/purchase-orders", async (req: Request, res: Response) => {
  try {
    const {
      supplierId, orderDate, currency, warehouseId, paymentTermId,
      expectedDeliveryDate, deliveryAddress, shippingMethod, incoterm,
      internalNotes, supplierNotes, quoteReference, lines,
    } = req.body ?? {};
    if (!supplierId || !orderDate || !currency || !warehouseId || !paymentTermId) {
      return res.status(400).json({ error: "supplierId, orderDate, currency, warehouseId, paymentTermId required" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "At least one line is required" });
    }
    for (const l of lines as LineInput[]) {
      if (
        !l.productId || !l.description || !l.orderedQty || !l.unitOfMeasure || l.unitPrice === undefined ||
        l.taxableAmount === undefined || l.vatAmount === undefined || l.totalAmount === undefined
      ) {
        return res.status(400).json({
          error: "Each line requires productId, description, orderedQty, unitOfMeasure, unitPrice, taxableAmount, vatAmount, totalAmount",
        });
      }
    }
    const po = await createPurchaseOrder(prisma, {
      supplierId, orderDate: new Date(orderDate), currency, buyerId: req.user!.id, warehouseId, paymentTermId,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      deliveryAddress: deliveryAddress ?? null, shippingMethod: shippingMethod ?? null, incoterm: incoterm ?? null,
      internalNotes: internalNotes ?? null, supplierNotes: supplierNotes ?? null, quoteReference: quoteReference ?? null,
      lines: (lines as LineInput[]).map(l => ({
        productId: l.productId, supplierSku: l.supplierSku ?? null, description: l.description,
        orderedQty: Number(l.orderedQty), unitOfMeasure: l.unitOfMeasure, unitPrice: Number(l.unitPrice),
        discountPct: l.discountPct !== undefined ? Number(l.discountPct) : null,
        taxableAmount: Number(l.taxableAmount), vatAmount: Number(l.vatAmount), totalAmount: Number(l.totalAmount),
      })),
    });
    res.json(po);
  } catch (err) {
    if ((err as any)?.code === "P2003") return res.status(404).json({ error: "Supplier, warehouse, payment term or product not found" });
    res.status(500).json({ error: String(err) });
  }
});

purchaseOrdersRouter.post("/purchase-orders/:id/transition", async (req: Request, res: Response) => {
  try {
    const { toStatus, note } = req.body ?? {};
    if (!toStatus) return res.status(400).json({ error: "toStatus required" });
    const po = await transitionPurchaseOrderStatus(prisma, req.params.id, toStatus, req.user!.id, note ?? null);
    res.json(po);
  } catch (err) {
    if (err instanceof InvalidTransitionError) return res.status(409).json({ error: err.message });
    if (notFound(err)) return res.status(404).json({ error: "Purchase order not found" });
    res.status(500).json({ error: String(err) });
  }
});

// Permanent deletion, any status — see deletePurchaseOrder()'s doc comment
// for why this is a deliberate exception to the usual cancel-don't-delete rule.
purchaseOrdersRouter.delete("/purchase-orders/:id", async (req: Request, res: Response) => {
  try {
    await deletePurchaseOrder(prisma, req.params.id);
    res.status(204).send();
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Purchase order not found" });
    res.status(500).json({ error: String(err) });
  }
});
