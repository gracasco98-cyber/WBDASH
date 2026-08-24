-- CreateEnum
CREATE TYPE "SupplierPaymentDueStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "SupplierPaymentDue" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "status" "SupplierPaymentDueStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPaymentDue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierPaymentDue_purchaseOrderId_idx" ON "SupplierPaymentDue"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierPaymentDue_status_idx" ON "SupplierPaymentDue"("status");

-- CreateIndex
CREATE INDEX "SupplierPaymentDue_dueDate_idx" ON "SupplierPaymentDue"("dueDate");

-- AddForeignKey
ALTER TABLE "SupplierPaymentDue" ADD CONSTRAINT "SupplierPaymentDue_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
