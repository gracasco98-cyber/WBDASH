// purchasing/routes/suppliers.routes.ts — Supplier + nested contacts/products CRUD.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findAllSuppliers, findSupplierById, createSupplier, updateSupplier, deactivateSupplier } from "../../repositories/purchasing/suppliers.repo";
import { createContact, updateContact, deleteContact } from "../../repositories/purchasing/supplier-contacts.repo";
import { addSupplierProduct, updateSupplierProductPrice, updateSupplierProductDetails, removeSupplierProduct } from "../../repositories/purchasing/supplier-products.repo";

export const suppliersRouter = Router();

function notFound(err: unknown): boolean {
  return (err as any)?.code === "P2025";
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
suppliersRouter.get("/suppliers", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllSuppliers(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.get("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    const supplier = await findSupplierById(prisma, req.params.id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.post("/suppliers", async (req: Request, res: Response) => {
  try {
    const { legalName, internalCode, supplierType, country } = req.body ?? {};
    if (!legalName || !internalCode || !supplierType || !country) {
      return res.status(400).json({ error: "legalName, internalCode, supplierType, country required" });
    }
    res.json(await createSupplier(prisma, req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

suppliersRouter.put("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    res.json(await updateSupplier(prisma, req.params.id, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Supplier not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateSupplier(prisma, req.params.id));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Supplier not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Contacts ────────────────────────────────────────────────────────────────
suppliersRouter.post("/suppliers/:id/contacts", async (req: Request, res: Response) => {
  try {
    const { name } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name required" });
    res.json(await createContact(prisma, req.params.id, req.body));
  } catch (err) {
    if ((err as any)?.code === "P2003") return res.status(404).json({ error: "Supplier not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.put("/suppliers/:supplierId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    res.json(await updateContact(prisma, req.params.contactId, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Contact not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:supplierId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    await deleteContact(prisma, req.params.contactId);
    res.json({ ok: true });
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "Contact not found" });
    res.status(500).json({ error: String(err) });
  }
});

// ─── Supplier products ───────────────────────────────────────────────────────
suppliersRouter.post("/suppliers/:id/products", async (req: Request, res: Response) => {
  try {
    const { productId, standardPrice } = req.body ?? {};
    if (!productId || standardPrice === undefined) {
      return res.status(400).json({ error: "productId, standardPrice required" });
    }
    res.json(await addSupplierProduct(prisma, req.params.id, { ...req.body, standardPrice: Number(standardPrice) }));
  } catch (err) {
    if ((err as any)?.code === "P2003") return res.status(404).json({ error: "Supplier or Product not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.put("/suppliers/:supplierId/products/:supplierProductId/price", async (req: Request, res: Response) => {
  try {
    const { price, currency, source, note } = req.body ?? {};
    if (price === undefined || !source) return res.status(400).json({ error: "price, source required" });
    res.json(await updateSupplierProductPrice(prisma, req.params.supplierProductId, { price: Number(price), currency, source, note }));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.put("/suppliers/:supplierId/products/:supplierProductId", async (req: Request, res: Response) => {
  try {
    res.json(await updateSupplierProductDetails(prisma, req.params.supplierProductId, req.body ?? {}));
  } catch (err) {
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});

suppliersRouter.delete("/suppliers/:supplierId/products/:supplierProductId", async (req: Request, res: Response) => {
  try {
    await removeSupplierProduct(prisma, req.params.supplierProductId);
    res.json({ ok: true });
  } catch (err) {
    // P2003 = FK constraint violation — the onDelete: Restrict on price history firing.
    if ((err as any)?.code === "P2003") {
      return res.status(409).json({ error: "Impossibile rimuovere: esiste uno storico prezzi collegato" });
    }
    if (notFound(err)) return res.status(404).json({ error: "SupplierProduct not found" });
    res.status(500).json({ error: String(err) });
  }
});
