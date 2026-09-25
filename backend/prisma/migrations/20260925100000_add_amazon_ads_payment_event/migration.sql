-- CreateTable
CREATE TABLE "AmazonAdsPaymentEvent" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "postedDate" TIMESTAMP(3) NOT NULL,
    "baseValue" DECIMAL(14,4) NOT NULL,
    "taxValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "transactionValue" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAdsPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmazonAdsPaymentEvent_amazonAccountId_postedDate_idx" ON "AmazonAdsPaymentEvent"("amazonAccountId", "postedDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdsPaymentEvent_amazonAccountId_invoiceId_transaction_key" ON "AmazonAdsPaymentEvent"("amazonAccountId", "invoiceId", "transactionType", "postedDate");

-- AddForeignKey
ALTER TABLE "AmazonAdsPaymentEvent" ADD CONSTRAINT "AmazonAdsPaymentEvent_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

