// sse.ts — Server-Sent Events broadcaster
// Zero external dependencies. Works with Express res objects.
import type { Response } from "express";

const clients = new Set<Response>();

/** Register a new SSE client connection */
export function addSSEClient(res: Response): void {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/** Broadcast an event to all connected SSE clients */
export function broadcast(event: string, data: unknown): void {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

/** Number of currently connected clients (for health checks) */
export function sseClientCount(): number {
  return clients.size;
}

// ─── Keepalive ────────────────────────────────────────────────────────────────
// Browsers disconnect idle SSE after 30–60 s of silence. Send a heartbeat
// comment every 25 s to keep all connections alive.
setInterval(() => {
  if (clients.size === 0) return;
  const ping = `: ping\n\n`;
  for (const res of clients) {
    try {
      res.write(ping);
    } catch {
      clients.delete(res);
    }
  }
}, 25_000);
