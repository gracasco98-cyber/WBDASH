// backfill-redcare-order-dates.ts — One-off correction: fixes createdAt/orderDate
// on Redcare/Mirakl orders imported before processedAt was wired into
// createOrder() (2026-08-24). Those orders all landed on their sync date
// instead of their real Mirakl order date, skewing revenue-by-date on the
// homepage. Shopify itself can't be corrected retroactively (no API field
// for it), so this corrects WBDASH's own stored dates only.
// Idempotent: re-running is a no-op for orders already correct.
// Run manually: npm run backfill:redcare-order-dates
import { prisma } from "../db";
import { fetchNewOrders } from "../mirakl/client";
import { findAllMiraklOrders } from "../repositories/mirakl/orders.repo";
import { correctOrderDate } from "../repositories/shopify/orders.repo";

async function backfillOrderDates(): Promise<void> {
  const localOrders = await findAllMiraklOrders(prisma);
  console.log(`[backfill-redcare-dates] ${localOrders.length} ordini Mirakl trovati in WBDASH`);

  // WAITING_ACCEPTANCE/RECEIVED/SHIPPED copre tutti gli stati "aperti" che
  // questo account produce — sufficiente per i 27 ordini noti al 2026-08-24.
  // Un ordine Mirakl chiuso/archiviato oltre questi stati non verrebbe
  // trovato: viene segnalato e saltato, non si indovina una data.
  const miraklOrders = await fetchNewOrders();
  const realDateByOrderId = new Map(miraklOrders.map((o) => [o.orderId, new Date(o.createdDate)]));

  let corrected = 0;
  let alreadyCorrect = 0;
  let notFound = 0;

  for (const local of localOrders) {
    const realDate = realDateByOrderId.get(local.miraklOrderId);
    if (!realDate) {
      notFound++;
      console.warn(
        `[backfill-redcare-dates] ${local.miraklOrderId}: non trovato su Mirakl (stato oltre WAITING_ACCEPTANCE/RECEIVED/SHIPPED?) — saltato, nessuna data indovinata`
      );
      continue;
    }

    const result = await correctOrderDate(prisma, local.shopifyOrderId, realDate);
    if (!result) {
      alreadyCorrect++;
      continue;
    }

    corrected++;
    console.log(
      `[backfill-redcare-dates] ${local.miraklOrderId} (${local.shopifyOrderId}): ${result.previousCreatedAt.toISOString()} -> ${realDate.toISOString()}`
    );
  }

  console.log(
    `[backfill-redcare-dates] Completato: ${corrected} corretti, ${alreadyCorrect} già corretti, ${notFound} non trovati su Mirakl`
  );
  await prisma.$disconnect();
}

backfillOrderDates().catch(async (err) => {
  console.error("[backfill-redcare-dates] Errore fatale:", err);
  await prisma.$disconnect();
  process.exit(1);
});
