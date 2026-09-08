import { Router, Request, Response } from "express";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { prisma } from "../db";

const router = Router();
const MAX_TEXT = 180_000;
let openai: OpenAI | null = null;

function aiClient() {
  if (!openai && process.env.OPENAI_API_KEY) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function serialize(row: any) {
  return { ...row, fileSize: Number(row.fileSize), objectives: Array.isArray(row.objectives) ? row.objectives : [], pillars: Array.isArray(row.pillars) ? row.pillars : [], risks: Array.isArray(row.risks) ? row.risks : [], kpis: Array.isArray(row.kpis) ? row.kpis : [], monthlyPlan: Array.isArray(row.monthlyPlan) ? row.monthlyPlan : [] };
}

async function analyzeStrategy(id: string, title: string, content: string) {
  const client = aiClient();
  if (!client) {
    await prisma.strategy.update({ where: { id }, data: { status: "ERROR", analysisError: "OPENAI_API_KEY non configurata sul server." } });
    return;
  }
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_STRATEGY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "Sei il responsabile strategico di un e-commerce. Analizza il documento in italiano e restituisci SOLO JSON valido con: summary (sintesi operativa 1200 caratteri), coreConcept (tesi centrale 800 caratteri), pillars (array 3-6 oggetti {name, rationale, actions:[string]}), objectives (array 5-10 oggetti {title, description, horizonMonths da 1 a 12, priority LOW|MEDIUM|HIGH, metric}), risks (array 3-6 oggetti {risk, signal, mitigation}), kpis (array 4-8 oggetti {name, target, cadence}), monthlyPlan (array 3-12 oggetti {month, focus, actions:[string], expectedOutcome}). Non inventare numeri non presenti; distingui i dati del documento dalle deduzioni e rendi gli obiettivi verificabili." }, { role: "user", content: `Titolo: ${title}\n\nDOCUMENTO:\n${content}` }],
    });
    const analysis = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    await prisma.strategy.update({ where: { id }, data: { summary: String(analysis.summary ?? ""), coreConcept: String(analysis.coreConcept ?? ""), objectives: Array.isArray(analysis.objectives) ? analysis.objectives : [], pillars: Array.isArray(analysis.pillars) ? analysis.pillars : [], risks: Array.isArray(analysis.risks) ? analysis.risks : [], kpis: Array.isArray(analysis.kpis) ? analysis.kpis : [], monthlyPlan: Array.isArray(analysis.monthlyPlan) ? analysis.monthlyPlan : [], analysisError: null, status: "READY" } });
  } catch (err) {
    console.error(`[Strategies] AI analysis failed for ${id}:`, err instanceof Error ? err.message : err);
    await prisma.strategy.update({ where: { id }, data: { status: "ERROR", analysisError: err instanceof Error ? err.message.slice(0, 500) : "Errore durante l'analisi AI." } });
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.strategy.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, fileName: true, mimeType: true, fileSize: true, summary: true, coreConcept: true, objectives: true, pillars: true, risks: true, kpis: true, monthlyPlan: true, analysisError: true, status: true, createdAt: true, updatedAt: true } });
    res.json({ strategies: rows.map(serialize) });
  } catch (err) { res.status(500).json({ error: "Impossibile recuperare le strategie." }); }
});

router.post("/", async (req: Request, res: Response) => {
  const { title, fileName, mimeType, fileSize, content, fileData } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || typeof fileName !== "string") return res.status(400).json({ error: "Titolo e file sono obbligatori." });
  let extractedText = typeof content === "string" ? content : "";
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    if (typeof fileData !== "string") return res.status(400).json({ error: "Dati PDF mancanti." });
    try {
      const parsed = await pdfParse(Buffer.from(fileData.replace(/^data:application\/pdf;base64,/, ""), "base64"));
      extractedText = parsed.text;
    } catch { return res.status(400).json({ error: "Impossibile estrarre il testo dal PDF." }); }
  }
  if (!extractedText.trim()) return res.status(400).json({ error: "Il documento non contiene testo leggibile." });
  if (extractedText.length > MAX_TEXT) return res.status(413).json({ error: "Il documento è troppo grande (massimo 180.000 caratteri)." });
  const row = await prisma.strategy.create({ data: { title: title.trim(), fileName, mimeType: typeof mimeType === "string" ? mimeType : "text/plain", fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : extractedText.length, sourceText: extractedText, createdById: req.user?.id ?? null } });
  void analyzeStrategy(row.id, row.title, row.sourceText);
  res.status(202).json(serialize(row));
});

router.patch("/:id/objectives/:index", async (req: Request, res: Response) => {
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: "Obiettivo non valido." });
  try {
    const row = await prisma.strategy.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Strategia non trovata." });
    const objectives = Array.isArray(row.objectives) ? row.objectives.map((item: any) => ({ ...item })) : [];
    if (!objectives[index]) return res.status(404).json({ error: "Obiettivo non trovato." });
    objectives[index].completed = Boolean(req.body?.completed);
    res.json(serialize(await prisma.strategy.update({ where: { id: row.id }, data: { objectives } })));
  } catch (err) { res.status(500).json({ error: "Impossibile aggiornare l'obiettivo." }); }
});

export default router;
