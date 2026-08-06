// chat.routes.ts — AI chatbot endpoint
// Orchestrates OpenAI function calling with real DB tools.
// The OpenAI API key is ONLY read server-side from process.env.OPENAI_API_KEY.
// Nothing sensitive is ever returned to the frontend.

import { Router, Request, Response } from "express";
import OpenAI from "openai";
import {
  getSalesSummary,
  getTopProducts,
  getChannelComparison,
  getPeriodComparison,
  getAmazonInventorySummary,
  getAmazonPpcSummary,
  getMarginAnalysis,
  getDashboardContext,
} from "../chat/tools";

const router = Router();

// Lazy-init so the server boots even without the key set
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY non configurata. Aggiungila al file .env del backend.");
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un assistente analitico esperto integrato nella dashboard e-commerce "WBDASH".
Hai accesso in tempo reale ai dati reali della piattaforma tramite strumenti dedicati.

## Canali di vendita
- **Shopify**: vendite multi-marketplace (IT, DE, FR, ES, UK, NL, PL, SE, EU)
- **Amazon FBA**: ordini, inventario PAN-EU, pubblicità PPC, commissioni, settlement

## KPI e metriche che conosci
- **Fatturato lordo** = revenue totale prima di sconti/resi
- **Fatturato netto** = dopo resi e rimborsi
- **Margine %** = (payout − COGS − fee Amazon) / payout × 100
- **Fee Amazon** = 15% referral + €3,80/unità FBA
- **ACOS** = spesa ads / revenue ads × 100 (più basso = meglio)
- **ROAS** = revenue ads / spesa ads (più alto = meglio)
- **Payout stimato** = fatturato − fee Amazon
- **Giorni rimanenti scorta** = fulfillableQty / velocità_giornaliera

## Comportamento
1. Usa sempre i tool per leggere dati reali prima di rispondere su numeri o trend.
2. Distingui chiaramente: **📊 Dato** (numero reale), **🔍 Analisi** (interpretazione), **💡 Suggerimento** (raccomandazione).
3. Rispondi nella lingua dell'utente (default: italiano).
4. Se i dati non bastano, dillo esplicitamente — non inventare mai numeri.
5. Sii sintetico per domande semplici, dettagliato per analisi complesse.
6. Nei confronti tra periodi mostra sempre variazione assoluta e percentuale.
7. Formatta le risposte in modo leggibile: usa grassetto, elenchi puntati, emoji per le sezioni.
8. Quando mostri tabelle di prodotti, includi sempre: nome, unità, fatturato, margine (se disponibile).
9. Suggerisci azioni concrete e verificabili basate sui dati letti.
10. Se devi fare assunzioni, dichiarale esplicitamente.

## Sezioni della dashboard disponibili
- **Overview** (/): KPI generali, grafico vendite, breakdown marketplace
- **Prodotti** (/products): analisi prodotti Shopify
- **Amazon** (/amazon): overview Amazon con KPI e timeseries
- **Amazon Prodotti** (/amazon/products): tabella ASIN con margini
- **Amazon Ordini** (/amazon/orders): lista ordini Amazon
- **Amazon PPC** (/amazon/ppc): campagne pubblicitarie
- **Amazon Magazzino** (/amazon/inventory): stock FBA deduplicato PAN-EU
- **Amazon P&L** (/amazon/pl): conto economico mensile
- **Amazon COGS** (/amazon/cogs): gestione costi per ASIN
- **Sync Center** (/amazon/sync): stato sincronizzazioni`;

// ─── OpenAI Tool definitions ──────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_dashboard_context",
      description: "Recupera il contesto generale della dashboard: totale ordini, date disponibili, ultimo sync. Chiamare sempre come primo step per orientarsi.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Riepilogo vendite per un periodo: ordini, fatturato lordo/netto, unità, resi. Funziona per Shopify, Amazon o entrambi.",
      parameters: {
        type: "object",
        properties: {
          dateFrom:    { type: "string", description: "Data inizio in formato YYYY-MM-DD" },
          dateTo:      { type: "string", description: "Data fine in formato YYYY-MM-DD" },
          channel:     { type: "string", enum: ["shopify", "amazon", "all"], description: "Canale di vendita" },
          marketplace: { type: "string", description: "Marketplace Amazon: IT, DE, FR, ES (opzionale)" },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_products",
      description: "Prodotti migliori o peggiori per fatturato, unità o ordini, in un dato periodo. Usa order='asc' per i peggiori.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Data inizio YYYY-MM-DD" },
          dateTo:   { type: "string", description: "Data fine YYYY-MM-DD" },
          channel:  { type: "string", enum: ["shopify", "amazon", "all"] },
          limit:    { type: "number", description: "Numero di prodotti da restituire (max 20, default 10)" },
          sortBy:   { type: "string", enum: ["revenue", "units", "orders"], description: "Criterio di ordinamento" },
          order:    { type: "string", enum: ["desc", "asc"], description: "desc=migliori, asc=peggiori" },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_channel_comparison",
      description: "Confronto Shopify vs Amazon: fatturato, ordini, unità, quota di mercato per ciascun canale e breakdown per marketplace.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string" },
          dateTo:   { type: "string" },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_period_comparison",
      description: "Confronto tra due periodi temporali: variazione percentuale di fatturato e ordini tra periodo 1 (recente) e periodo 2 (precedente).",
      parameters: {
        type: "object",
        properties: {
          period1From: { type: "string", description: "Inizio periodo recente YYYY-MM-DD" },
          period1To:   { type: "string", description: "Fine periodo recente YYYY-MM-DD" },
          period2From: { type: "string", description: "Inizio periodo precedente YYYY-MM-DD" },
          period2To:   { type: "string", description: "Fine periodo precedente YYYY-MM-DD" },
        },
        required: ["period1From", "period1To", "period2From", "period2To"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_amazon_inventory",
      description: "Riepilogo inventario FBA: SKU totali, unità disponibili, in arrivo, fuori stock, critici (≤15 unità).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_amazon_ppc",
      description: "Performance pubblicità Amazon: spesa, revenue ads, ACOS, ROAS, click, impressioni e top campagne per un periodo.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string" },
          dateTo:   { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_margin_analysis",
      description: "Analisi margini per prodotto Amazon: fatturato, COGS, fee stimate, margine percentuale. Evidenzia prodotti senza COGS configurato.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string" },
          dateTo:   { type: "string" },
          limit:    { type: "number", description: "Numero prodotti (default 10, max 20)" },
        },
        required: [],
      },
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function runTool(name: string, args: any): Promise<string> {
  console.log(`[Chat] Tool: ${name}`, JSON.stringify(args).slice(0, 200));
  try {
    let result: any;
    switch (name) {
      case "get_dashboard_context":  result = await getDashboardContext();            break;
      case "get_sales_summary":      result = await getSalesSummary(args);            break;
      case "get_top_products":       result = await getTopProducts(args);             break;
      case "get_channel_comparison": result = await getChannelComparison(args);       break;
      case "get_period_comparison":  result = await getPeriodComparison(args);        break;
      case "get_amazon_inventory":   result = await getAmazonInventorySummary();      break;
      case "get_amazon_ppc":         result = await getAmazonPpcSummary(args);        break;
      case "get_margin_analysis":    result = await getMarginAnalysis(args);          break;
      default: result = { error: `Tool sconosciuto: ${name}` };
    }
    return JSON.stringify(result);
  } catch (err: any) {
    console.error(`[Chat] Tool error (${name}):`, err?.message);
    return JSON.stringify({ error: `Errore nel recupero dati: ${err?.message ?? "sconosciuto"}` });
  }
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { messages, pageContext } = req.body as {
      messages: OpenAI.Chat.ChatCompletionMessageParam[];
      pageContext?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages è richiesto e non può essere vuoto" });
    }

    const openai = getOpenAI();

    // Build system message (include page context if provided)
    const systemContent = pageContext
      ? `${SYSTEM_PROMPT}\n\n## Pagina corrente dell'utente\n${pageContext}`
      : SYSTEM_PROMPT;

    const conversation: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...messages.slice(-20), // max last 20 messages for context window safety
    ];

    const toolsUsed: string[] = [];
    const MAX_ROUNDS = 4; // max tool-call rounds to prevent runaway loops

    // Agentic loop: call OpenAI, execute tools, repeat until text response
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: conversation,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1500,
      });

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      conversation.push(msg);

      // If no tool calls → we have the final text answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const reply = msg.content ?? "Nessuna risposta disponibile.";
        const ms    = Date.now() - startedAt;
        console.log(`[Chat] Completed in ${ms}ms, tools: [${toolsUsed.join(", ")}]`);
        return res.json({ reply, toolsUsed, ms });
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          toolsUsed.push(tc.function.name);
          let fnArgs: any = {};
          try { fnArgs = JSON.parse(tc.function.arguments); } catch {}
          const content = await runTool(tc.function.name, fnArgs);
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content,
          };
        })
      );

      conversation.push(...toolResults);
    }

    // Fallback if we somehow exit the loop without a text response
    return res.json({
      reply: "Mi dispiace, non sono riuscito a completare l'analisi. Riprova con una domanda più specifica.",
      toolsUsed,
    });
  } catch (err: any) {
    console.error("[Chat] Error:", err?.message);
    const isKeyMissing = err?.message?.includes("OPENAI_API_KEY");
    return res.status(isKeyMissing ? 503 : 500).json({
      error: isKeyMissing
        ? "Chatbot non configurato: OPENAI_API_KEY mancante nel server."
        : `Errore del chatbot: ${err?.message ?? "sconosciuto"}`,
    });
  }
});

export default router;
