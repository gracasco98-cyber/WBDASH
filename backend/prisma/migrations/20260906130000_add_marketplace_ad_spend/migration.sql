-- CreateTable
CREATE TABLE "MarketplaceAdSpend" (
    "id" TEXT NOT NULL,
    "spendDate" DATE NOT NULL,
    "marketplace" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAdSpend_spendDate_marketplace_key"
ON "MarketplaceAdSpend"("spendDate", "marketplace");

-- CreateIndex
CREATE INDEX "MarketplaceAdSpend_marketplace_spendDate_idx"
ON "MarketplaceAdSpend"("marketplace", "spendDate");

-- CreateIndex
CREATE INDEX "MarketplaceAdSpend_spendDate_idx"
ON "MarketplaceAdSpend"("spendDate");
