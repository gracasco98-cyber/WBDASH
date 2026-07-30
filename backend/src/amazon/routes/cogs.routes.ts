// amazon/routes/cogs.routes.ts — COGS CRUD + Price Entries + Catalog Images
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  findAllCogs,
  upsertCogs,
  upsertCogsImageUrl,
  updateCogsForAsin,
  deleteCogs,
  findCogsImages,
  findPriceEntries,
  findMostRecentPriceEntry,
  createPriceEntry,
  updatePriceEntry,
  deletePriceEntry,
} from "../../repositories/amazon/cogs.repo";
import { MARKETPLACE_IDS, EU_ENDPOINT } from "../config";
import { getSpApiToken } from "../token.service";

export const cogsRouter = Router();

// ─── GET /cogs ─────────────────────────────────────────────────────────────────
cogsRouter.get("/cogs", async (_req: Request, res: Response) => {
  try {
    const cogs = await findAllCogs(prisma);
    res.json(cogs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /cogs ────────────────────────────────────────────────────────────────
cogsRouter.post("/cogs", async (req: Request, res: Response) => {
  try {
    const { asin, marketplace = "ALL", cogsPerUnit, currency = "EUR", notes } = req.body ?? {};
    if (!asin || cogsPerUnit === undefined) {
      return res.status(400).json({ error: "asin and cogsPerUnit required" });
    }
    const entry = await upsertCogs(prisma, { asin, marketplace, cogsPerUnit: Number(cogsPerUnit), currency, notes: notes ?? null });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /cogs/entries ────────────────────────────────────────────────────────
// Returns all price history entries grouped by ASIN
cogsRouter.get("/cogs/entries", async (req: Request, res: Response) => {
  try {
    const { asin } = req.query as Record<string, string>;
    const entries = await findPriceEntries(prisma, { asin });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /cogs/entries ───────────────────────────────────────────────────────
cogsRouter.post("/cogs/entries", async (req: Request, res: Response) => {
  try {
    const { asin, sku, productTitle, imageUrl, marketplace = "ALL", supplier, purchaseDate, pricePerUnit, shippingCost = 0, quantity, notes, currency = "EUR" } = req.body ?? {};
    if (!asin || pricePerUnit === undefined || !purchaseDate) {
      return res.status(400).json({ error: "asin, pricePerUnit, purchaseDate required" });
    }
    const entry = await createPriceEntry(prisma, {
      asin, sku: sku ?? null, productTitle: productTitle ?? null, imageUrl: imageUrl ?? null,
      marketplace, supplier: supplier ?? null,
      purchaseDate: new Date(purchaseDate),
      pricePerUnit: Number(pricePerUnit),
      shippingCost: Number(shippingCost),
      quantity: quantity ? Number(quantity) : null,
      notes: notes ?? null, currency,
    });
    // Auto-sync: update AmazonProductCogs with the most recent price for this ASIN
    const mostRecent = await findMostRecentPriceEntry(prisma, asin);
    if (mostRecent) {
      await upsertCogs(prisma, {
        asin, marketplace,
        cogsPerUnit:  mostRecent.pricePerUnit,
        shippingCost: mostRecent.shippingCost,
        sku:          mostRecent.sku ?? null,
        productTitle: mostRecent.productTitle ?? null,
        imageUrl:     mostRecent.imageUrl ?? null,
        currency:     mostRecent.currency,
        notes: `Auto-sync da storico prezzi: ${mostRecent.supplier ?? "—"} ${new Date(mostRecent.purchaseDate).toLocaleDateString("it-IT")}`,
      });
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── PUT /cogs/entries/:id ────────────────────────────────────────────────────
cogsRouter.put("/cogs/entries/:id", async (req: Request, res: Response) => {
  try {
    const { supplier, purchaseDate, pricePerUnit, shippingCost, quantity, notes, productTitle, imageUrl, sku, marketplace, currency } = req.body ?? {};
    const entry = await updatePriceEntry(prisma, req.params.id, {
      ...(supplier !== undefined && { supplier }),
      ...(purchaseDate !== undefined && { purchaseDate: new Date(purchaseDate) }),
      ...(pricePerUnit !== undefined && { pricePerUnit: Number(pricePerUnit) }),
      ...(shippingCost !== undefined && { shippingCost: Number(shippingCost) }),
      ...(quantity !== undefined && { quantity: quantity ? Number(quantity) : null }),
      ...(notes !== undefined && { notes }),
      ...(productTitle !== undefined && { productTitle }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(sku !== undefined && { sku }),
      ...(marketplace !== undefined && { marketplace }),
      ...(currency !== undefined && { currency }),
    });
    // Auto-sync most recent price
    const mostRecent = await findMostRecentPriceEntry(prisma, entry.asin);
    if (mostRecent) {
      await upsertCogs(prisma, {
        asin:         entry.asin,
        marketplace:  entry.marketplace,
        cogsPerUnit:  mostRecent.pricePerUnit,
        shippingCost: mostRecent.shippingCost,
        currency:     mostRecent.currency,
        notes:        "Auto-sync da storico prezzi",
      });
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /cogs/entries/:id ─────────────────────────────────────────────────
cogsRouter.delete("/cogs/entries/:id", async (req: Request, res: Response) => {
  try {
    const entry = await deletePriceEntry(prisma, req.params.id);
    // Re-sync after delete
    const mostRecent = await findMostRecentPriceEntry(prisma, entry.asin);
    if (mostRecent) {
      await updateCogsForAsin(prisma, {
        asin:         entry.asin,
        cogsPerUnit:  mostRecent.pricePerUnit,
        shippingCost: mostRecent.shippingCost,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /cogs/:id ─────────────────────────────────────────────────────────
cogsRouter.delete("/cogs/:id", async (req: Request, res: Response) => {
  try {
    await deleteCogs(prisma, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /cogs/bulk ───────────────────────────────────────────────────────────
// Accepts: { records: [{asin, sku, marketplace, productTitle, cogsPerUnit, shippingCost, vatRate, vatCategory, currency, notes}] }
cogsRouter.post("/cogs/bulk", async (req: Request, res: Response) => {
  try {
    const { records } = req.body ?? {};
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "records[] required" });
    }
    let upserted = 0; let skipped = 0; let errors = 0;
    for (const r of records) {
      try {
        if (!r.asin) { skipped++; continue; }
        await upsertCogs(prisma, {
          asin:         r.asin,
          marketplace:  r.marketplace ?? "ALL",
          sku:          r.sku ?? null,
          productTitle: r.productTitle ?? null,
          cogsPerUnit:  Number(r.cogsPerUnit ?? 0),
          shippingCost: Number(r.shippingCost ?? 0),
          vatRate:      Number(r.vatRate ?? 0),
          vatCategory:  r.vatCategory ?? null,
          currency:     r.currency ?? "EUR",
          notes:        r.notes ?? null,
        });
        upserted++;
      } catch (_e) { errors++; }
    }
    console.log(`[COGS] Bulk import: ${upserted} upserted, ${skipped} skipped, ${errors} errors`);
    res.json({ upserted, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Catalog Images (COGS domain: persists to AmazonCogs.imageUrl) ──────────

// ASIN image cache: keyed by ASIN, stores real url (null = not found, undefined = not tried yet)
const _imgCache = new Map<string, { url: string | null; at: number }>();
const IMG_HIT_TTL  = 24 * 3600 * 1000; // 24h for real images
const IMG_MISS_TTL =  1 * 3600 * 1000; // 1h for nulls (retry later)

const ALL_MP_IDS = Object.values(MARKETPLACE_IDS).join(",");

/** Extract best image URL from a catalog item (MAIN preferred, then any variant) */
function extractImage(item: any): string | null {
  if (!item.images?.length) return null;
  for (const imgSet of item.images) {
    for (const img of (imgSet.images ?? [])) {
      if (img.variant === "MAIN" && img.link) return img.link;
    }
  }
  for (const imgSet of item.images) {
    for (const img of (imgSet.images ?? [])) {
      if (img.link) return img.link;
    }
  }
  return null;
}

const CATALOG_DELAY_MS = 400;
const MP_PRIORITY = ["IT", "DE", "FR", "ES", "PL", "UK"] as const;

async function catalogImageFor(asins: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};

  for (const asin of asins) {
    let found = false;
    for (const mpCode of MP_PRIORITY) {
      const mpId = MARKETPLACE_IDS[mpCode];
      if (!mpId) continue;
      try {
        const token = await getSpApiToken();
        const params = new URLSearchParams();
        params.append("identifiers", asin);
        params.set("identifiersType", "ASIN");
        params.append("marketplaceIds", mpId);
        params.set("includedData", "images");
        const res = await fetch(`${EU_ENDPOINT}/catalog/2022-04-01/items?${params.toString()}`, {
          headers: { "x-amz-access-token": token },
        });
        if (!res.ok) continue;
        const json = await res.json() as any;
        const img = json.items?.[0] ? extractImage(json.items[0]) : null;
        if (img) {
          result[asin] = img;
          found = true;
          break;
        }
      } catch (e) {
        console.warn(`[Catalog] ${asin}/${mpCode} failed:`, String(e).slice(0, 100));
      }
    }
    if (!found) result[asin] = null;
    await new Promise(r => setTimeout(r, CATALOG_DELAY_MS));
  }

  return result;
}

// ─── GET /catalog/images ───────────────────────────────────────────────────────
// Fetch real product image URLs from SP-API Catalog Items API.
// Returns { asin: imageUrl } map. Results are cached 24h in memory.
// Also persists to AmazonCogs.imageUrl for future use.
cogsRouter.get("/catalog/images", async (req: Request, res: Response) => {
  try {
    const { asins = "" } = req.query as Record<string, string>;
    const asinList = asins.split(",").map(a => a.trim()).filter(Boolean).slice(0, 100);
    if (asinList.length === 0) return res.json({});

    const now = Date.now();
    const result: Record<string, string | null> = {};
    const toFetch: string[] = [];

    for (const asin of asinList) {
      const cached = _imgCache.get(asin);
      if (cached) {
        const ttl = cached.url ? IMG_HIT_TTL : IMG_MISS_TTL;
        if (now - cached.at < ttl) {
          result[asin] = cached.url;
          continue;
        }
      }
      toFetch.push(asin);
    }

    if (toFetch.length > 0) {
      const fetched = await catalogImageFor(toFetch);
      for (const asin of toFetch) {
        const url = fetched[asin] ?? null;
        _imgCache.set(asin, { url, at: now });
        result[asin] = url;

        // Persist to AmazonProductCogs (upsert so it works even with no existing COGS record)
        if (url) {
          upsertCogsImageUrl(prisma, asin, url).catch(() => {});
        }
      }
    }

    res.json(result);
  } catch (err) {
    console.error("[Amazon] GET /catalog/images:", err);
    res.status(500).json({ error: String(err) });
  }
});
