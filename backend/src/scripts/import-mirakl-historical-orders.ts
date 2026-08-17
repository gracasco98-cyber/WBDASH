// import-mirakl-historical-orders.ts — One-off backfill: creates real Shopify
// orders (already fulfilled, with real Mirakl tracking) for Mirakl (Redcare/
// Shop-Apotheke) orders that shipped before this integration existed.
// Idempotent via the MiraklOrder table and the Shopify recovery tag — safe to
// re-run, already-imported orders are skipped.
// Run manually: npm run import:mirakl-historical
import { prisma } from "../db";
import { fetchShippedOrders } from "../mirakl/client";
import { mapMiraklOrder } from "../mirakl/orderMapper";
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

async function importHistoricalOrders(): Promise<void> {
  const orders = await fetchShippedOrders();
  console.log(`[import-mirakl-historical] ${orders.length} ordini SHIPPED trovati su Mirakl`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of orders) {
    try {
      const existing = await findByMiraklOrderId(prisma, order.orderId);
      if (existing) {
        skipped++;
        console.log(`[import-mirakl-historical] ${order.orderId} già importato (stato ${existing.miraklState}) — salto`);
        continue;
      }

      if (!order.shippingTracking) {
        throw new Error(`Ordine ${order.orderId} è SHIPPED ma non ha un tracking number`);
      }

      const mapped = mapMiraklOrder(order);
      const miraklTag = `mirakl:${order.orderId}`;

      // Stesso meccanismo di recupero del sync live: se un run precedente ha
      // creato l'ordine Shopify ma è fallito prima di salvare la riga locale,
      // lo ritrova per tag invece di ricrearlo (evita un doppione pagante).
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
          tags: [mapped.tag, miraklTag, "import-storico"],
          note: `Importato da Mirakl (storico) — ordine ${order.orderId}`,
          currency: mapped.currency,
          totalAmount: mapped.totalAmount,
          shippingAmount: mapped.shippingAmount,
          shippingAddress: mapped.shippingAddress,
          lineItems,
        });
      }

      // Ordine già spedito nella realtà: lo segniamo evaso subito, con il
      // tracking reale, invece di lasciarlo "da spedire" per il magazzino.
      await createFulfillment({
        orderId: shopifyOrder.id,
        trackingNumber: order.shippingTracking,
        trackingUrl: order.shippingTrackingUrl ?? undefined,
        trackingCompany: order.shippingCompany ?? "N/D",
      });

      // Nessuna scrittura verso Mirakl: l'ordine è già chiuso lì, questa è
      // un'operazione a senso unico verso Shopify. Solo stato locale.
      await createPendingAcceptOrder(prisma, {
        miraklOrderId: order.orderId,
        shopifyOrderId: shopifyOrder.id,
        country: mapped.country,
      });
      await markAccepted(prisma, order.orderId);
      await markShipped(prisma, shopifyOrder.id, order.shippingTracking);

      imported++;
      console.log(
        `[import-mirakl-historical] ${order.orderId} -> Shopify ${shopifyOrder.name} (${shopifyOrder.id}) importato ed evaso`
      );
    } catch (err) {
      errors++;
      await logError("mirakl-historical-import", err, { miraklOrderId: order.orderId });
      console.error(
        `[import-mirakl-historical] Errore su ${order.orderId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[import-mirakl-historical] Completato: ${imported} importati, ${skipped} già presenti, ${errors} errori`
  );
  await prisma.$disconnect();
}

importHistoricalOrders().catch(async (err) => {
  console.error("[import-mirakl-historical] Errore fatale:", err);
  await prisma.$disconnect();
  process.exit(1);
});
