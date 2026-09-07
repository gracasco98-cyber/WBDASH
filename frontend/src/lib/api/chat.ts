// lib/api/chat.ts — POST /api/chat, the OpenAI tool-calling assistant that
// answers questions using real DB-backed tools (see backend/src/chat/tools.ts).
// Shared by ChatWidget's own fetch and any other caller (e.g. an in-page
// "Insight AI" panel) that wants the same real-data-grounded answers.
import { apiUrl } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  toolsUsed?: string[];
  ms?: number;
}

async function send(messages: ChatMessage[], pageContext: string): Promise<ChatResponse> {
  const res = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, pageContext }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export const chat = { send };
