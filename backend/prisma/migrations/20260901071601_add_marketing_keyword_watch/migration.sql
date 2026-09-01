-- CreateTable
CREATE TABLE "MarketingKeywordWatch" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "label" TEXT,
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingKeywordWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingKeywordSnapshot" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "found" BOOLEAN NOT NULL,
    "position" INTEGER,
    "nbHits" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "sellerName" TEXT,
    "productName" TEXT,
    "promoted" BOOLEAN,
    "promotedByReRanking" BOOLEAN,

    CONSTRAINT "MarketingKeywordSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingKeywordWatch_active_idx" ON "MarketingKeywordWatch"("active");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingKeywordWatch_market_keyword_ean_key" ON "MarketingKeywordWatch"("market", "keyword", "ean");

-- CreateIndex
CREATE INDEX "MarketingKeywordSnapshot_watchId_checkedAt_idx" ON "MarketingKeywordSnapshot"("watchId", "checkedAt");

-- AddForeignKey
ALTER TABLE "MarketingKeywordSnapshot" ADD CONSTRAINT "MarketingKeywordSnapshot_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "MarketingKeywordWatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
