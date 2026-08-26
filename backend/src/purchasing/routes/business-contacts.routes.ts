// purchasing/routes/business-contacts.routes.ts — BusinessContact CRUD (Clienti/Agenti).
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  findAllBusinessContacts, createBusinessContact, updateBusinessContact, deactivateBusinessContact,
} from "../../repositories/purchasing/business-contacts.repo";

export const businessContactsRouter = Router();

businessContactsRouter.get("/business-contacts", async (_req: Request, res: Response) => {
  try {
    res.json(await findAllBusinessContacts(prisma));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

businessContactsRouter.post("/business-contacts", async (req: Request, res: Response) => {
  try {
    const { type, name, referent, email, phone, address, notes } = req.body ?? {};
    if (!type || !name) return res.status(400).json({ error: "type and name required" });
    res.json(await createBusinessContact(prisma, {
      type, name, referent: referent ?? null, email: email ?? null, phone: phone ?? null,
      address: address ?? null, notes: notes ?? null,
    }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

businessContactsRouter.put("/business-contacts/:id", async (req: Request, res: Response) => {
  try {
    const { name, referent, email, phone, address, notes } = req.body ?? {};
    res.json(await updateBusinessContact(prisma, req.params.id, { name, referent, email, phone, address, notes }));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BusinessContact not found" });
    res.status(500).json({ error: String(err) });
  }
});

businessContactsRouter.delete("/business-contacts/:id", async (req: Request, res: Response) => {
  try {
    res.json(await deactivateBusinessContact(prisma, req.params.id));
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "BusinessContact not found" });
    res.status(500).json({ error: String(err) });
  }
});
