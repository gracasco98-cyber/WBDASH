// webhooks.ts — Shopify webhook endpoint with HMAC verification
import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../db";
import { fetchOrderById, logError } from "../services/shopify.service";
import { upsertOrder } from "../services/order.service";
import { broadcast } from "../sse/sse";
import { findOrderForBroadcast } from "../repositories/shopify/orders.repo";
import { findByShopifyOrderId, markShipped } from "../repositories/mirakl/orders.repo";
import { shipOrder } from "../mirakl/client";
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";

// ─── HMAC verification ────────────────────────────────────────────────────────
function verifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode: skip if no secret set
  const digest = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const topic     = req.headers["x-shopify-topic"] as string;
  const shopifyId = req.headers["x-shopify-order-id"] as string ?? "";
  const hmac      = req.headers["x-shopify-hmac-sha256"] as string ?? "";
  const rawBody: Buffer = (req as any).rawBody;

  // ── Step 1: HMAC verification (<1ms, synchronous) ─────────────────────────
  if (!verifyHmac(rawBody, hmac)) {
    res.status(401).json({ error: "Invalid HMAC" });
    return;
  }

  // ── Step 2: respond immediately — Shopify gets 200 in <5ms ───────────────
  // Processing happens in the background; Shopify does NOT retry on 200.
  res.status(200).json({ status: "queued" });

  // ── Step 3: async processing — does NOT block the HTTP response ───────────
  // req.body is already parsed and held in memory, safe to read after respond.
  const payload = req.body;

  setImmediate(async () => {
    // Idempotency: skip if this event was already processed successfully
    const existing = await prisma.webhookEventLog.findFirst({
      where: { shopifyId, topic, processed: true },
    });
    if (existing) return;

    const logEntry = await prisma.webhookEventLog.create({
      data: { topic, shopifyId, payload },
    });

    try {
      if (
        topic === "orders/create" ||
        topic === "orders/updated" ||
        topic === "orders/cancelled"
      ) {
        // Re-fetch from Shopify API for full payload (webhook body may be partial)
        const gid = `gid://shopify/Order/${shopifyId}`;
        const fullOrder = await fetchOrderById(gid);
        if (fullOrder) {
          await upsertOrder(fullOrder);

          // Broadcast live event to SSE clients (only for new orders, not updates/cancellations)
          if (topic === "orders/create") {
            try {
              const saved = await findOrderForBroadcast(prisma, shopifyId);
              if (saved) {
                broadcast("order:new", {
                  source:      "shopify",
                  orderName:   saved.orderName,
                  total:       saved.totalAmount,
                  marketplace: saved.marketplaceDetected,
                  ts:          saved.createdAt.toISOString(),
                });
              }
            } catch {
              // broadcast failure must never crash the webhook handler
            }
          }
        }
      } else if (topic === "fulfillments/create") {
        // Order shipped on Shopify -> push tracking to Mirakl if this order
        // was created from a Mirakl (Redcare) order and tracking wasn't
        // already synced (idempotency across duplicate/retried webhooks).
        // NB: X-Shopify-Order-Id isn't a guaranteed header for this topic
        // (unlike orders/*), so fall back to the payload's own order_id —
        // the fulfillment payload always carries it.
        const fulfillmentOrderId = String(payload.order_id ?? shopifyId);
        const gid = `gid://shopify/Order/${fulfillmentOrderId}`;
        const miraklOrder = await findByShopifyOrderId(prisma, gid);
        if (miraklOrder && miraklOrder.miraklState === "ACCEPTED" && !miraklOrder.trackingSyncedAt) {
          const trackingNumber: string | null =
            payload.tracking_number ?? payload.tracking_numbers?.[0] ?? null;
          if (trackingNumber) {
            await shipOrder(miraklOrder.miraklOrderId, {
              carrierName: payload.tracking_company ?? "N/D",
              trackingNumber,
              carrierUrl: payload.tracking_url ?? payload.tracking_urls?.[0],
            });
            await markShipped(prisma, gid, trackingNumber);
          }
        }
      }

      await prisma.webhookEventLog.update({
        where: { id: logEntry.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (err) {
      await logError("webhook", err, { topic, shopifyId });
      await prisma.webhookEventLog.update({
        where: { id: logEntry.id },
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  });
}
