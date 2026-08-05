"use client";
import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import {
  MessageSquare, X, Send, Loader2, Bot, User, Sparkles,
  RotateCcw, ChevronDown,
} from "lucide-react";
import { usePathname } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  ms?: number;
  error?: boolean;
}

// ─── Page context helper ──────────────────────────────────────────────────────

const PAGE_CONTEXT: Record<string, string> = {
  "/":                   "Pagina Overview — KPI generali Shopify, grafico vendite, breakdown marketplace",
  "/products":           "Pagina Prodotti Shopify — tabella prodotti con fatturato, unità, trend",
  "/amazon":             "Pagina Overview Amazon — KPI Amazon, timeseries revenue, breakdown marketplace",
  "/amazon/products":    "Pagina Prodotti Amazon — tabella ASIN con fatturato, margini, fee, COGS",
  "/amazon/orders":      "Pagina Ordini Amazon — lista ordini paginata con filtri",
  "/amazon/inventory":   "Pagina Magazzino FBA — stock deduplcato PAN-EU, giorni rimanenti, velocità",
  "/amazon/ppc":         "Pagina PPC Amazon — campagne pubblicitarie, ACOS, ROAS, spesa ads",
  "/amazon/pl":          "Pagina P&L Amazon — conto economico mensile: fatturato, fee, COGS, utile",
  "/amazon/cogs":        "Pagina COGS Amazon — gestione costi per ASIN/SKU",
  "/amazon/sync":        "Pagina Sync Center — stato sincronizzazioni, backfill, job history",
};

// ─── Minimal markdown renderer ────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith("### ")) {
      nodes.push(<h4 key={i} className="text-zinc-200 font-bold text-[12px] mt-3 mb-1">{formatInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      nodes.push(<h3 key={i} className="text-zinc-100 font-bold text-[13px] mt-3 mb-1">{formatInline(line.slice(3))}</h3>);
    // Bullet lists
    } else if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="space-y-0.5 my-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5">
              <span className="text-accent-primary mt-0.5 shrink-0">·</span>
              <span>{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    // Numbered lists
    } else if (/^\d+\.\s/.test(line)) {
      const items: { n: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\.\s(.*)/);
        if (m) items.push({ n: m[1], text: m[2] });
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="space-y-0.5 my-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5">
              <span className="text-accent-primary font-semibold shrink-0 w-4">{item.n}.</span>
              <span>{formatInline(item.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    // Divider
    } else if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} className="border-bg-border my-2" />);
    // Empty line
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
    // Normal paragraph
    } else {
      nodes.push(<p key={i} className="leading-relaxed">{formatInline(line)}</p>);
    }
    i++;
  }
  return nodes;
}

function formatInline(text: string): React.ReactNode {
  // Bold: **text** or __text__
  // Code: `code`
  // We split by these patterns and render accordingly
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) {
      return <strong key={i} className="text-zinc-100 font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (/^`.*`$/.test(part)) {
      return <code key={i} className="bg-bg-border text-emerald-400 px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>;
    }
    // Preserve emoji and color emoji labels
    return <span key={i}>{part}</span>;
  });
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTED = [
  "Come vanno le vendite questo mese?",
  "Top 5 prodotti Amazon per fatturato negli ultimi 30 giorni",
  "Confronta questo mese con il mese scorso",
  "Quali prodotti hanno margine negativo?",
  "Com'è il magazzino FBA? Ci sono critici?",
  "Quanto spendiamo in Amazon PPC e qual è il ROAS?",
];

// ─── API call ─────────────────────────────────────────────────────────────────

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function sendChat(
  messages: { role: "user" | "assistant"; content: string }[],
  pageContext: string
): Promise<{ reply: string; toolsUsed?: string[]; ms?: number }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, pageContext }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [unread,   setUnread]   = useState(0);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const pathname    = usePathname();

  const pageContext = useMemo(
    () => PAGE_CONTEXT[pathname] ?? `Pagina: ${pathname}`,
    [pathname]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setUnread(0);
    }
  }, [open]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build messages for API (only role + content, no internal fields)
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const { reply, toolsUsed, ms } = await sendChat(history, pageContext);
      setMessages(prev => [...prev, { role: "assistant", content: reply, toolsUsed, ms }]);
      if (!open) setUnread(u => u + 1);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `⚠️ **Errore:** ${err?.message ?? "Impossibile contattare il server"}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pageContext, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed chat-safe-bottom right-6 z-50 flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 ${
          open
            ? "bg-bg-border hover:bg-bg-hover rotate-90"
            : "bg-accent-primary hover:bg-accent-primary/90 scale-100 hover:scale-105"
        }`}
        style={{ width: 52, height: 52 }}
        title="Assistente AI"
      >
        {open ? (
          <X size={20} className="text-zinc-200" />
        ) : (
          <div className="relative">
            <MessageSquare size={22} className="text-white" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unread}
              </span>
            )}
          </div>
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-[76px] right-3 sm:right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-bg-border bg-bg-card transition-all duration-300 origin-bottom-right w-[calc(100vw-1.5rem)] sm:w-[400px] h-[520px] sm:h-[600px] ${
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-border shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent-primary/15 border border-accent-primary/20">
            <Sparkles size={14} className="text-accent-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-zinc-100 font-semibold text-[13px]">Analytics AI</div>
            <div className="text-zinc-500 text-[10px] truncate">{pageContext.split("—")[0].trim()}</div>
          </div>
          {messages.length > 0 && (
            <button onClick={reset} title="Nuova conversazione"
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-bg-hover transition-colors">
              <RotateCcw size={13} />
            </button>
          )}
          <button onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-bg-hover transition-colors">
            <ChevronDown size={15} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {isEmpty ? (
            // Welcome state
            <div className="flex flex-col h-full items-center justify-center text-center gap-5">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                  <Bot size={22} className="text-accent-primary" />
                </div>
                <div>
                  <div className="text-zinc-200 font-semibold text-[14px]">Sono il tuo assistente AI</div>
                  <div className="text-zinc-500 text-[11px] mt-1 max-w-[260px]">
                    Chiedimi qualsiasi cosa sui tuoi dati: vendite, prodotti, margini, stock, trend e molto altro.
                  </div>
                </div>
              </div>
              {/* Suggested prompts */}
              <div className="w-full space-y-1.5">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium mb-2">Domande suggerite</div>
                {SUGGESTED.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-bg-hover border border-bg-border text-zinc-400 text-[11px] hover:text-zinc-200 hover:border-accent-primary/40 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-accent-primary/20 border border-accent-primary/30"
                    : msg.error
                    ? "bg-red-500/15 border border-red-500/20"
                    : "bg-bg-hover border border-bg-border"
                }`}>
                  {msg.role === "user"
                    ? <User size={13} className="text-accent-primary" />
                    : <Bot  size={13} className={msg.error ? "text-red-400" : "text-zinc-400"} />}
                </div>

                {/* Bubble */}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12px] ${
                  msg.role === "user"
                    ? "bg-accent-primary/15 border border-accent-primary/25 text-zinc-200 rounded-tr-sm"
                    : msg.error
                    ? "bg-red-500/8 border border-red-500/15 text-red-300 rounded-tl-sm"
                    : "bg-bg-hover border border-bg-border text-zinc-300 rounded-tl-sm"
                }`}>
                  {msg.role === "assistant" && !msg.error
                    ? <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                    : <span className="whitespace-pre-wrap">{msg.content}</span>
                  }
                  {/* Meta: tools used + response time */}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-bg-border">
                      {msg.toolsUsed.map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-bg-border rounded text-[9px] text-zinc-500 font-mono">
                          {t.replace("get_", "").replace(/_/g, " ")}
                        </span>
                      ))}
                      {msg.ms && (
                        <span className="ml-auto text-[9px] text-zinc-600">{(msg.ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-bg-hover border border-bg-border flex items-center justify-center shrink-0">
                <Bot size={13} className="text-zinc-400" />
              </div>
              <div className="bg-bg-hover border border-bg-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Loader2 size={12} className="text-accent-primary animate-spin" />
                  <span className="text-zinc-500 text-[11px]">Analizzando i dati…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 px-3 py-3 border-t border-bg-border">
          <div className="flex items-end gap-2 bg-bg-hover border border-bg-border rounded-xl px-3 py-2.5 focus-within:border-accent-primary/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Chiedi sui tuoi dati… (Invio per inviare)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-600 text-[12px] resize-none outline-none leading-relaxed max-h-24 disabled:opacity-50"
              style={{ scrollbarWidth: "none" }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-accent-primary/90 hover:bg-accent-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {loading
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Send size={13} className="text-white" />
              }
            </button>
          </div>
          <div className="text-center text-[9px] text-zinc-700 mt-1.5">
            Risposte basate su dati reali · GPT-4o · Invio = invia · Shift+Invio = a capo
          </div>
        </div>
      </div>
    </>
  );
}
