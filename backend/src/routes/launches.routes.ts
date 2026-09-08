import { Router, Request, Response } from "express";
import { prisma } from "../db";

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numberField(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value: unknown, field: string): number {
  const n = numberField(value);
  if (n < 0) throw new Error(`${field} non può essere negativo.`);
  return n;
}

function serializeDay(day: any) {
  const costs = ["adsCost", "reviewCost", "couponCost", "giveawayCost", "logisticsCost", "otherCost"];
  const serialized = { ...day, day: day.day.toISOString().slice(0, 10) } as Record<string, any>;
  for (const key of costs.concat(["fakeRevenue"])) serialized[key] = Number(day[key] ?? 0);
  if (day.reviewRating != null) serialized.reviewRating = Number(day.reviewRating);
  serialized.keywords = (day.keywords ?? []).map((keyword: any) => ({
    ...keyword,
    fakeRevenue: Number(keyword.fakeRevenue ?? 0),
    adsCost: Number(keyword.adsCost ?? 0),
  }));
  serialized.totalCost = costs.reduce((sum, key) => sum + Number(day[key] ?? 0), 0);
  serialized.netLaunchImpact = Number(day.fakeRevenue ?? 0) - serialized.totalCost;
  return serialized;
}

function serializeLaunch(launch: any) {
  const days = (launch.days ?? []).map(serializeDay);
  const totalFakeRevenue = days.reduce((sum: number, day: any) => sum + day.fakeRevenue, 0);
  const totalLaunchCost = days.reduce((sum: number, day: any) => sum + day.totalCost, 0);
  return {
    ...launch,
    startedOn: launch.startedOn.toISOString().slice(0, 10),
    days,
    totals: {
      fakeRevenue: totalFakeRevenue,
      launchCost: totalLaunchCost,
      netImpact: totalFakeRevenue - totalLaunchCost,
      reviews: days.reduce((sum: number, day: any) => sum + day.reviewCount, 0),
    },
  };
}

const dayInclude = { keywords: { orderBy: { keyword: "asc" as const } } };

// Catalogo prodotti esistenti: usato dalla scheda lancio per mantenere il
// collegamento con l'anagrafica invece di creare un prodotto parallelo.
router.get("/catalog", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, brand: true, identifiers: { select: { asin: true, sku: true, marketplace: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ products });
  } catch (err) {
    console.error("[Launches] catalog:", err);
    res.status(500).json({ error: "Impossibile recuperare il catalogo prodotti." });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const from = req.query.from ? dateOnly(req.query.from) : null;
    const to = req.query.to ? dateOnly(req.query.to) : null;
    const days = await prisma.launchDay.findMany({
      where: { ...(from || to ? { day: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { fakeRevenue: true, fakeOrders: true, reviewCount: true, adsCost: true, reviewCost: true, couponCost: true, giveawayCost: true, logisticsCost: true, otherCost: true },
    });
    const cost = (d: any) => [d.adsCost, d.reviewCost, d.couponCost, d.giveawayCost, d.logisticsCost, d.otherCost].reduce((s, v) => s + Number(v ?? 0), 0);
    res.json({
      fakeRevenue: days.reduce((s, d) => s + Number(d.fakeRevenue), 0),
      fakeOrders: days.reduce((s, d) => s + d.fakeOrders, 0),
      reviews: days.reduce((s, d) => s + d.reviewCount, 0),
      launchCost: days.reduce((s, d) => s + cost(d), 0),
      days: days.length,
    });
  } catch (err) {
    console.error("[Launches] summary:", err);
    res.status(500).json({ error: "Impossibile calcolare il riepilogo lanci." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const launches = await prisma.launch.findMany({ orderBy: [{ status: "asc" }, { startedOn: "desc" }], include: { days: { include: dayInclude, orderBy: { day: "desc" } } } });
    res.json({ launches: launches.map(serializeLaunch) });
  } catch (err) {
    console.error("[Launches] list:", err);
    res.status(500).json({ error: "Impossibile recuperare i lanci." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, productName, productId, sku, marketplace, startedOn, notes } = req.body ?? {};
    const date = dateOnly(startedOn);
    if (typeof name !== "string" || !name.trim() || typeof productName !== "string" || !productName.trim() || !date) return res.status(400).json({ error: "Nome, prodotto e data di inizio sono obbligatori." });
    const launch = await prisma.launch.create({ data: { name: name.trim(), productName: productName.trim(), productId: productId || null, sku: sku || null, marketplace: marketplace || "all", startedOn: date, notes: notes || null }, include: { days: { include: dayInclude, orderBy: { day: "desc" } } } });
    res.status(201).json(serializeLaunch(launch));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Impossibile creare il lancio." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id }, include: { days: { include: dayInclude, orderBy: { day: "desc" } } } });
    if (!launch) return res.status(404).json({ error: "Lancio non trovato." });
    res.json(serializeLaunch(launch));
  } catch (err) { res.status(500).json({ error: "Impossibile recuperare il lancio." }); }
});

router.put("/:id/days/:day", async (req, res) => {
  try {
    const date = dateOnly(req.params.day);
    if (!date) return res.status(400).json({ error: "Data non valida." });
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!launch) return res.status(404).json({ error: "Lancio non trovato." });
    const b = req.body ?? {};
    const day = await prisma.launchDay.upsert({
      where: { launchId_day: { launchId: req.params.id, day: date } },
      create: { launchId: req.params.id, day: date, fakeRevenue: nonNegative(b.fakeRevenue, "Vendite fake"), fakeOrders: Math.max(0, Math.round(nonNegative(b.fakeOrders, "Ordini"))), reviewCount: Math.max(0, Math.round(nonNegative(b.reviewCount, "Review"))), reviewRating: b.reviewRating == null || b.reviewRating === "" ? null : nonNegative(b.reviewRating, "Valutazione"), adsCost: nonNegative(b.adsCost, "Ads"), reviewCost: nonNegative(b.reviewCost, "Costo review"), couponCost: nonNegative(b.couponCost, "Coupon"), giveawayCost: nonNegative(b.giveawayCost, "Omaggio"), logisticsCost: nonNegative(b.logisticsCost, "Logistica"), otherCost: nonNegative(b.otherCost, "Altro costo"), note: b.note || null },
      update: { fakeRevenue: nonNegative(b.fakeRevenue, "Vendite fake"), fakeOrders: Math.max(0, Math.round(nonNegative(b.fakeOrders, "Ordini"))), reviewCount: Math.max(0, Math.round(nonNegative(b.reviewCount, "Review"))), reviewRating: b.reviewRating == null || b.reviewRating === "" ? null : nonNegative(b.reviewRating, "Valutazione"), adsCost: nonNegative(b.adsCost, "Ads"), reviewCost: nonNegative(b.reviewCost, "Costo review"), couponCost: nonNegative(b.couponCost, "Coupon"), giveawayCost: nonNegative(b.giveawayCost, "Omaggio"), logisticsCost: nonNegative(b.logisticsCost, "Logistica"), otherCost: nonNegative(b.otherCost, "Altro costo"), note: b.note || null },
      include: dayInclude,
    });
    res.json(serializeDay(day));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Impossibile salvare la giornata." }); }
});

router.put("/:id/days/:day/keywords", async (req, res) => {
  try {
    const date = dateOnly(req.params.day);
    const keyword = String(req.body?.keyword ?? "").trim();
    if (!date || !keyword) return res.status(400).json({ error: "Data e parola chiave sono obbligatorie." });
    const day = await prisma.launchDay.findUnique({ where: { launchId_day: { launchId: req.params.id, day: date } }, select: { id: true } });
    if (!day) return res.status(404).json({ error: "Salva prima la giornata del lancio." });
    const b = req.body;
    const row = await prisma.launchKeywordDay.upsert({
      where: { launchDayId_keyword: { launchDayId: day.id, keyword } },
      create: { launchDayId: day.id, keyword, position: b.position == null || b.position === "" ? null : Math.max(1, Math.round(nonNegative(b.position, "Posizione"))), previousPosition: b.previousPosition == null || b.previousPosition === "" ? null : Math.max(1, Math.round(nonNegative(b.previousPosition, "Posizione precedente"))), volume: b.volume == null || b.volume === "" ? null : Math.max(0, Math.round(nonNegative(b.volume, "Volume"))), fakeRevenue: nonNegative(b.fakeRevenue, "Vendite fake"), fakeOrders: Math.max(0, Math.round(nonNegative(b.fakeOrders, "Ordini"))), reviewCount: Math.max(0, Math.round(nonNegative(b.reviewCount, "Review"))), adsCost: nonNegative(b.adsCost, "Ads"), note: b.note || null },
      update: { position: b.position == null || b.position === "" ? null : Math.max(1, Math.round(nonNegative(b.position, "Posizione"))), previousPosition: b.previousPosition == null || b.previousPosition === "" ? null : Math.max(1, Math.round(nonNegative(b.previousPosition, "Posizione precedente"))), volume: b.volume == null || b.volume === "" ? null : Math.max(0, Math.round(nonNegative(b.volume, "Volume"))), fakeRevenue: nonNegative(b.fakeRevenue, "Vendite fake"), fakeOrders: Math.max(0, Math.round(nonNegative(b.fakeOrders, "Ordini"))), reviewCount: Math.max(0, Math.round(nonNegative(b.reviewCount, "Review"))), adsCost: nonNegative(b.adsCost, "Ads"), note: b.note || null },
    });
    res.json({ ...row, fakeRevenue: Number(row.fakeRevenue), adsCost: Number(row.adsCost) });
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Impossibile salvare la keyword." }); }
});

export default router;
