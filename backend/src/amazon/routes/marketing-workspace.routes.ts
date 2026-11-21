import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { findProductById } from "../../repositories/amazon/product.repo";
import { findDailyProductMetrics, findMarketingWorkspace, upsertMarketingWorkspace } from "../../repositories/amazon/marketing-workspace.repo";
import { syncMarketingProduct } from "../marketing-workspace.service";
import { parseMarketingWorkbook } from "../marketing-workbook-import.service";

export const marketingWorkspaceRouter = Router();

const updateSchema = z.object({
  overview: z.record(z.unknown()).optional(), communication: z.record(z.unknown()).optional(),
  ped: z.record(z.unknown()).optional(), workbook: z.record(z.unknown()).optional(),
  assets: z.record(z.unknown()).optional(),
}).strict();

function range(req: Request) {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 89 * 86_400_000);
  from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999);
  return { from, to };
}

marketingWorkspaceRouter.get("/marketing/products/:productId/workspace", async (req: Request, res: Response) => {
  try {
    const marketplace = String(req.query.marketplace ?? "IT").toUpperCase();
    const product = await findProductById(prisma, req.params.productId);
    if (!product) return res.status(404).json({ error: "Prodotto non trovato" });
    const identifier = product.identifiers.find((item) => item.channelType === "AMAZON" && item.marketplace === marketplace && item.asin);
    const workspace = await findMarketingWorkspace(prisma, product.id, marketplace);
    const metrics = identifier?.asin
      ? await findDailyProductMetrics(prisma, { asin: identifier.asin, marketplace, ...range(req) })
      : [];
    res.json({ product, identifier: identifier ?? null, workspace, metrics });
  } catch (error) {
    console.error("[Marketing Workspace] GET", error);
    res.status(500).json({ error: "Impossibile caricare l'area prodotto" });
  }
});

marketingWorkspaceRouter.patch("/marketing/products/:productId/workspace", async (req: Request, res: Response) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Dati workspace non validi", details: parsed.error.flatten() });
    const marketplace = String(req.query.marketplace ?? "IT").toUpperCase();
    if (!await findProductById(prisma, req.params.productId)) return res.status(404).json({ error: "Prodotto non trovato" });
    const workspace = await upsertMarketingWorkspace(prisma, {
      productId: req.params.productId, marketplace, ...(parsed.data as any),
    });
    res.json({ workspace });
  } catch (error) {
    console.error("[Marketing Workspace] PATCH", error);
    res.status(500).json({ error: "Impossibile salvare l'area prodotto" });
  }
});

marketingWorkspaceRouter.post("/marketing/products/:productId/sync", async (req: Request, res: Response) => {
  try {
    const marketplace = String(req.query.marketplace ?? "IT").toUpperCase();
    const result = await syncMarketingProduct(req.params.productId, marketplace);
    res.status(result.warning ? 207 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sincronizzazione fallita";
    res.status(message.includes("non trovato") || message.includes("Nessun ASIN") ? 404 : 500).json({ error: message });
  }
});

marketingWorkspaceRouter.post("/marketing/products/:productId/workspace/import", async (req: Request, res: Response) => {
  try {
    const fileBase64 = typeof req.body?.fileBase64 === "string" ? req.body.fileBase64 : "";
    if (!fileBase64 || fileBase64.length > 2_000_000) return res.status(400).json({ error: "File Excel mancante o troppo grande" });
    const marketplace = String(req.query.marketplace ?? "IT").toUpperCase();
    const product = await findProductById(prisma, req.params.productId);
    if (!product) return res.status(404).json({ error: "Prodotto non trovato" });
    const imported = parseMarketingWorkbook(Buffer.from(fileBase64, "base64"), product.name);
    const workspace = await upsertMarketingWorkspace(prisma, {
      productId: product.id, marketplace, workbook: imported.workbook as any, communication: imported.communication as any,
    });
    res.json({ workspace, importedRows: imported.workbook.rows.length, sheetNames: imported.sheetNames });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Importazione Excel fallita";
    res.status(400).json({ error: message });
  }
});
