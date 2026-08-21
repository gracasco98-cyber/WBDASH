// syncOrders.job.ts — Mirakl (Redcare) order sync: WAITING_ACCEPTANCE -> Shopify order -> Mirakl accept.
// Standalone: nessuna dipendenza da backend/src/amazon/**.
import { prisma } from "../db";
import { fetchNewOrders, acceptOrder } from "./client";
import { mapMiraklOrder } from "./orderMapper";
import {
  findVariantIdBySku,
  createOrder,
  createFulfillment,
  findOrderByMiraklTag,
  logError,
} from "../services/shopify.service";
import {
  findByMiraklOrderId,
  createPendingAcceptOrder,
  markAccepted,
  markShipped,
} from "../repositories/mirakl/orders.repo";

// Retries the local "accepted" write a few times before giving up. Covers the
// case where acceptOrder() already succeeded on Mirakl (the order has left
// WAITING_ACCEPTANCE, so fetchNewOrders() will never surface it again) but the
// local DB write hits a transient error — without this, the order would be
// stuck at PENDING_ACCEPT forever and later fail markShipped's state guard.
export async function markAcceptedWithRetry(miraklOrderId: string, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await markAccepted(prisma, miraklOrderId);
      return;
    } catch (err) {
      if (i === attempts - 1) {
        await logError("mirakl-sync-stuck", err, {
          miraklOrderId,
          note: "acceptOrder succeeded on Mirakl but the local state write failed after retries — this order needs manual review (it will not be retried automatically, since it has left Mirakl's WAITING_ACCEPTANCE feed).",
        });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
}

export async function runMiraklSync(): Promise<{ created: number; accepted: number; errors: number }> {
  let created = 0;
  let accepted = 0;
  let errors = 0;

  let orders;
  try {
    orders = await fetchNewOrders();
  } catch (err) {
    await logError("mirakl-sync", err);
    return { created, accepted, errors: 1 };
  }

  for (const order of orders) {
    try {
      let existing = await findByMiraklOrderId(prisma, order.orderId);

      if (!existing) {
        const mapped = mapMiraklOrder(order);
        const miraklTag = `mirakl:${order.orderId}`;

        // Recovery: a prior run may have created the Shopify order but crashed
        // (or hit a transient DB error) before persisting the MiraklOrder row.
        // Check by tag before creating again, to avoid a duplicate paid order.
        const alreadyCreated = await findOrderByMiraklTag(order.orderId);

        let shopifyOrder: { id: string; name: string };
        if (alreadyCreated) {
          shopifyOrder = alreadyCreated;
        } else {
          const lineItems: Array<{ variantId: string; quantity: number; unitPrice: number }> = [];
          for (const item of mapped.lineItems) {
            const variantId = await findVariantIdBySku(item.sku);
            if (!variantId) {
              throw new Error(
                `Nessuna variante Shopify trovata per SKU "${item.sku}" (ordine Mirakl ${order.orderId})`
              );
            }
            lineItems.push({ variantId, quantity: item.quantity, unitPrice: item.unitPrice });
          }

          shopifyOrder = await createOrder({
            email: mapped.email,
            tags: [mapped.tag, miraklTag],
            note: `Importato da Mirakl — ordine ${order.orderId}`,
            currency: mapped.currency,
            totalAmount: mapped.totalAmount,
            shippingAmount: mapped.shippingAmount,
            shippingAddress: mapped.shippingAddress,
            lineItems,
          });
        }

        existing = await createPendingAcceptOrder(prisma, {
          miraklOrderId: order.orderId,
          shopifyOrderId: shopifyOrder.id,
          country: mapped.country,
        });
        created++;
      }

      if (existing.miraklState === "PENDING_ACCEPT") {
        // L'account reale non produce ordini in WAITING_ACCEPTANCE (arrivano
        // già RECEIVED/AUTO_RECEIVED) — chiamare l'accettazione ha senso solo
        // se l'ordine è davvero ancora in attesa; altrimenti Mirakl lo ha già
        // gestito e serve solo allineare lo stato locale.
        if (order.orderState === "WAITING_ACCEPTANCE") {
          await acceptOrder(order.orderId, order.orderLines.map((l) => l.id));
        }
        await markAcceptedWithRetry(order.orderId);
        existing.miraklState = "ACCEPTED"; // riflette la transizione appena fatta, per il controllo sotto
        accepted++;
      }

      // Il canale reale spedisce spesso l'ordine prima ancora che WBDASH
      // riesca a sincronizzarlo (es. un gap nel catalogo Shopify che ha
      // ritardato la creazione, o fulfillment center esterno che spedisce
      // indipendentemente da Mirakl) — se il tracking è già disponibile,
      // evadilo subito invece di lasciarlo "da spedire" all'infinito.
      if (order.shippingTracking && existing.miraklState === "ACCEPTED") {
        await createFulfillment({
          orderId: existing.shopifyOrderId,
          trackingNumber: order.shippingTracking,
          trackingUrl: order.shippingTrackingUrl ?? undefined,
          trackingCompany: order.shippingCompany ?? "N/D",
        });
        await markShipped(prisma, existing.shopifyOrderId, order.shippingTracking);
      }
    } catch (err) {
      errors++;
      await logError("mirakl-sync", err, { miraklOrderId: order.orderId });
    }
  }

  return { created, accepted, errors };
}

// Guard anti-overlap: a differenza del poller Shopify (idempotente per upsert),
// questo job crea ordini pagati e la sua difesa contro i duplicati
// (findOrderByMiraklTag) interroga l'indice di ricerca Shopify, che è
// eventually consistent — un run sovrapposto potrebbe legittimamente non vedere
// un ordine creato pochi istanti prima dal run precedente ancora in corso.
let isRunning = false;

export function startMiraklPolling(intervalMs = 300_000): void {
  console.log(`[Mirakl] Polling started (every ${intervalMs / 1000}s)`);
  setInterval(() => {
    if (isRunning) return;
    isRunning = true;
    runMiraklSync()
      .catch((err) => logError("mirakl-polling", err))
      .finally(() => { isRunning = false; });
  }, intervalMs);
}
