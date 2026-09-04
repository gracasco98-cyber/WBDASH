// lib/api/board.ts — Personal "bacheca" widget-layout persistence.
import { apiUrl, get } from "./client";

export interface BoardWidget {
  i: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export const board = {
  getLayout: () => get<{ layout: BoardWidget[] }>("/api/board/layout"),
  saveLayout: (layout: BoardWidget[]) => put("/api/board/layout", { layout }),
};
