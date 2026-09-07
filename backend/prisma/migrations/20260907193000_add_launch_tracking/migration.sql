CREATE TABLE "Launch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'all',
    "startedOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Launch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Launch_status_idx" ON "Launch"("status");
CREATE INDEX "Launch_startedOn_idx" ON "Launch"("startedOn");

CREATE TABLE "LaunchDay" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "fakeRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "fakeOrders" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "reviewRating" DECIMAL(4,2),
    "adsCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reviewCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "couponCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "giveawayCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "logisticsCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaunchDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LaunchDay_launchId_day_key" ON "LaunchDay"("launchId", "day");
CREATE INDEX "LaunchDay_day_idx" ON "LaunchDay"("day");
ALTER TABLE "LaunchDay" ADD CONSTRAINT "LaunchDay_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LaunchKeywordDay" (
    "id" TEXT NOT NULL,
    "launchDayId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "position" INTEGER,
    "previousPosition" INTEGER,
    "volume" INTEGER,
    "fakeRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "fakeOrders" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "adsCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaunchKeywordDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LaunchKeywordDay_launchDayId_keyword_key" ON "LaunchKeywordDay"("launchDayId", "keyword");
CREATE INDEX "LaunchKeywordDay_keyword_idx" ON "LaunchKeywordDay"("keyword");
ALTER TABLE "LaunchKeywordDay" ADD CONSTRAINT "LaunchKeywordDay_launchDayId_fkey" FOREIGN KEY ("launchDayId") REFERENCES "LaunchDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
