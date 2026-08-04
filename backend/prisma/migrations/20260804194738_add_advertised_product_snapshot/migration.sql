-- CreateTable
CREATE TABLE "AmazonAdvertisedProductSnapshot" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "marketplace" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "spend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAdvertisedProductSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmazonAdvertisedProductSnapshot_amazonAccountId_idx" ON "AmazonAdvertisedProductSnapshot"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonAdvertisedProductSnapshot_snapshotDate_idx" ON "AmazonAdvertisedProductSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "AmazonAdvertisedProductSnapshot_asin_idx" ON "AmazonAdvertisedProductSnapshot"("asin");

-- CreateIndex
CREATE INDEX "AmazonAdvertisedProductSnapshot_marketplace_idx" ON "AmazonAdvertisedProductSnapshot"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdvertisedProductSnapshot_amazonAccountId_snapshotDat_key" ON "AmazonAdvertisedProductSnapshot"("amazonAccountId", "snapshotDate", "marketplace", "asin", "campaignId");

-- AddForeignKey
ALTER TABLE "AmazonAdvertisedProductSnapshot" ADD CONSTRAINT "AmazonAdvertisedProductSnapshot_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
