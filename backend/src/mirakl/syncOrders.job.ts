// syncOrders.job.ts — Mirakl (Redcare) order sync: WAITING_ACCEPTANCE -> Shopify order -> Mirakl accept.
// Standalone: nessuna dipendenza da backend/src/amazon/**.
import { prisma } from "../db";
import { fetchNewOrders, acceptOrder } from "./client";
import { mapMiraklOrder } from "./orderMapper";
import { findVariantIdBySku, createOrder, logError } from "../services/shopify.service";
import {
  findByMiraklOrderId,
  createPendingAcceptOrder,
  markAccepted,
} from "../repositories/mirakl/orders.repo";

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

        const shopifyOrder = await createOrder({
          email: mapped.email,
          tags: [mapped.tag],
          note: `Importato da Mirakl — ordine ${order.orderId}`,
          currency: mapped.currency,
          totalAmount: mapped.totalAmount,
          shippingAddress: mapped.shippingAddress,
          lineItems,
        });

        existing = await createPendingAcceptOrder(prisma, {
          miraklOrderId: order.orderId,
          shopifyOrderId: shopifyOrder.id,
          country: mapped.country,
        });
        created++;
      }

      if (existing.miraklState === "PENDING_ACCEPT") {
        await acceptOrder(order.orderId, order.orderLines.map((l) => l.id));
        await markAccepted(prisma, order.orderId);
        accepted++;
      }
    } catch (err) {
      errors++;
      await logError("mirakl-sync", err, { miraklOrderId: order.orderId });
    }
  }

  return { created, accepted, errors };
}

export function startMiraklPolling(intervalMs = 300_000): void {
  console.log(`[Mirakl] Polling started (every ${intervalMs / 1000}s)`);
  setInterval(() => {
    runMiraklSync().catch((err) => logError("mirakl-polling", err));
  }, intervalMs);
}
