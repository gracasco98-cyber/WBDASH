-- CreateTable
CREATE TABLE "MiraklOrder" (
    "id" TEXT NOT NULL,
    "miraklOrderId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "miraklState" TEXT NOT NULL DEFAULT 'PENDING_ACCEPT',
    "trackingNumber" TEXT,
    "trackingSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiraklOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiraklOrder_miraklOrderId_key" ON "MiraklOrder"("miraklOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "MiraklOrder_shopifyOrderId_key" ON "MiraklOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "MiraklOrder_miraklState_idx" ON "MiraklOrder"("miraklState");
