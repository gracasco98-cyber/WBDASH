import { apiUrl, get } from "./client";

export interface StrategyObjective { title: string; description: string; horizonMonths: number; priority: "LOW" | "MEDIUM" | "HIGH"; completed?: boolean; }
export interface Strategy { id: string; title: string; fileName: string; mimeType: string; fileSize: number; summary: string | null; coreConcept: string | null; objectives: StrategyObjective[]; status: "PROCESSING" | "READY" | "ERROR"; createdAt: string; updatedAt: string; }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
export const strategies = {
  list: () => get<{ strategies: Strategy[] }>("/api/strategies"),
  analyze: (data: { title: string; fileName: string; mimeType: string; fileSize: number; content?: string; fileData?: string }) => post<Strategy>("/api/strategies", data),
  setObjectiveDone: (id: string, index: number, completed: boolean) => patch<Strategy>(`/api/strategies/${id}/objectives/${index}`, { completed }),
};
