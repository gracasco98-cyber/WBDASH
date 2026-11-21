CREATE TABLE "AmazonMarketingWorkspace" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'IT',
    "overview" JSONB,
    "communication" JSONB,
    "ped" JSONB,
    "workbook" JSONB,
    "assets" JSONB,
    "trafficData" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonMarketingWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AmazonMarketingWorkspace_amazonAccountId_productId_marketplace_key"
ON "AmazonMarketingWorkspace"("amazonAccountId", "productId", "marketplace");
CREATE INDEX "AmazonMarketingWorkspace_amazonAccountId_idx" ON "AmazonMarketingWorkspace"("amazonAccountId");
CREATE INDEX "AmazonMarketingWorkspace_productId_idx" ON "AmazonMarketingWorkspace"("productId");

ALTER TABLE "AmazonMarketingWorkspace" ADD CONSTRAINT "AmazonMarketingWorkspace_amazonAccountId_fkey"
FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmazonMarketingWorkspace" ADD CONSTRAINT "AmazonMarketingWorkspace_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Promoted units are distinct from attributed orders in Amazon Ads reports.
ALTER TABLE "AmazonAdvertisedProductSnapshot" ADD COLUMN "units" INTEGER NOT NULL DEFAULT 0;
