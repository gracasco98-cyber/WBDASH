-- AlterTable
ALTER TABLE "DocumentSequence" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "PurchaseOrder_buyerId_idx" ON "PurchaseOrder"("buyerId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_paymentTermId_idx" ON "PurchaseOrder"("paymentTermId");

-- CreateIndex
CREATE INDEX "PurchaseOrderStatusHistory_changedById_idx" ON "PurchaseOrderStatusHistory"("changedById");

