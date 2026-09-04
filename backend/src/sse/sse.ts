// sse.ts — Server-Sent Events broadcaster
// Zero external dependencies. Works with Express res objects.
import type { Response } from "express";

interface SSEClient {
  res: Response;
  userId: string | null;
}

const clients = new Set<SSEClient>();

/** Register a new SSE client connection. `userId` enables targeted delivery
 *  via broadcastToUser — omit it for an anonymous/global-only client. */
export function addSSEClient(res: Response, userId: string | null = null): void {
  const client: SSEClient = { res, userId };
  clients.add(client);
  res.on("close", () => clients.delete(client));
}

/** Broadcast an event to all connected SSE clients */
export function broadcast(event: string, data: unknown): void {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

/** Send an event only to client(s) registered with the given userId — for
 *  per-user notifications (e.g. "someone assigned you a task"). A user with
 *  no connection open, or an anonymous client, simply receives nothing. */
export function broadcastToUser(userId: string, event: string, data: unknown): void {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.userId !== userId) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
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
  for (const client of clients) {
    try {
      client.res.write(ping);
    } catch {
      clients.delete(client);
    }
  }
}, 25_000);
