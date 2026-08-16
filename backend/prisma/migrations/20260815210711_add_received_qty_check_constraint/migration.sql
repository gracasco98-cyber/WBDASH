-- Prevents receivedQty from ever exceeding orderedQty on a PurchaseOrderLine,
-- as a database-level backstop to the application-level check in
-- goods-receipts.repo.ts (createGoodsReceipt), which is not airtight under
-- genuine concurrent transactions at Postgres's default READ COMMITTED
-- isolation. See docs/superpowers/specs/2026-08-14-goods-receipt-fase-e1-design.md.
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_receivedQty_check" CHECK ("receivedQty" <= "orderedQty");
