-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT,
    "rawTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceName" TEXT,
    "sourceIdentifier" TEXT,
    "channelDisplayName" TEXT,
    "customerCountry" TEXT,
    "customerEmail" TEXT,
    "marketplaceDetected" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "marketplaceDetectionReason" TEXT,
    "isRefunded" BOOLEAN NOT NULL DEFAULT false,
    "refundedAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,4) NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "lineItemsCount" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "tagPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channelNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastOrderCursor" TEXT,
    "totalSynced" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppErrorLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantId" TEXT,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "originalUnitPrice" DECIMAL(14,4) NOT NULL,
    "totalDiscount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "imageUrl" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "refundedAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDailySnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "sku" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "imageUrl" TEXT,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "refundedUnits" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'EU',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lwaClientId" TEXT,
    "lwaClientSecretEnc" TEXT,
    "spApiRefreshTokenEnc" TEXT,
    "spApiRefreshTokenNAEnc" TEXT,
    "adsClientId" TEXT,
    "adsClientSecretEnc" TEXT,
    "adsRefreshTokenEnc" TEXT,
    "adsProfileIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonSyncJob" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordsIn" INTEGER NOT NULL DEFAULT 0,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsRejected" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "reportId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AmazonSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonOrder" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "amazonOrderId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "lastUpdatedDate" TIMESTAMP(3) NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "salesChannel" TEXT NOT NULL DEFAULT 'Amazon.it',
    "marketplace" TEXT NOT NULL,
    "fulfillmentChannel" TEXT NOT NULL DEFAULT 'AFN',
    "shipCountry" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "itemTotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isBusinessOrder" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonOrderItem" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "amazonOrderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "quantityOrdered" INTEGER NOT NULL DEFAULT 1,
    "quantityShipped" INTEGER NOT NULL DEFAULT 0,
    "itemPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "itemTax" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "promotionDiscount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "marketplace" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonProductSnapshot" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "adSpend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "bsr" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonProductSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonSettlement" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "depositDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonSettlementTransaction" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "orderId" TEXT,
    "asin" TEXT,
    "sku" TEXT,
    "marketplace" TEXT NOT NULL,
    "amountType" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "postedDate" TIMESTAMP(3) NOT NULL,
    "quantityPurchased" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonSettlementTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonProductCogs" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'ALL',
    "productTitle" TEXT,
    "cogsPerUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatCategory" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "imageUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonProductCogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonCogsPriceEntry" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT,
    "imageUrl" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'ALL',
    "supplier" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "pricePerUnit" DECIMAL(14,4) NOT NULL,
    "shippingCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "quantity" INTEGER,
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonCogsPriceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonInventory" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT,
    "marketplace" TEXT NOT NULL DEFAULT 'IT',
    "productTitle" TEXT,
    "imageUrl" TEXT,
    "qtyAfn" INTEGER NOT NULL DEFAULT 0,
    "qtyMfn" INTEGER NOT NULL DEFAULT 0,
    "qtyInbound" INTEGER NOT NULL DEFAULT 0,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "qtyTotal" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "reorderQty" INTEGER NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 30,
    "salesVelocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daysRemaining" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonAdSnapshot" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "marketplace" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adGroupId" TEXT,
    "adGroupName" TEXT,
    "campaignType" TEXT NOT NULL DEFAULT 'SP',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "acos" DOUBLE PRECISION,
    "roas" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAdSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonAdKeywordSnapshot" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "marketplace" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'EXACT',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "acos" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAdKeywordSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonAdSearchTerm" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT '',
    "adGroupId" TEXT NOT NULL DEFAULT '',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "acos" DOUBLE PRECISION,
    "roas" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isWasted" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonAdSearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonAdKeyword" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "bid" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAdKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonForecastCalibration" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "payoutRatio" DOUBLE PRECISION NOT NULL,
    "rCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rFba" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rAds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rAdsVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rDsf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rStorage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rInbound" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rPrep" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rRefunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rOther" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rReimb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgStoragePerSett" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgInboundPerSett" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAdsPerSett" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rRefundsSmoothed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataPoints" INTEGER NOT NULL DEFAULT 0,
    "ewmaAlpha" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "lastForecastErrorPct" DOUBLE PRECISION,
    "avgForecastErrorPct" DOUBLE PRECISION,
    "bestForecastErrorPct" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "recentErrors" JSONB,
    "hasBias" BOOLEAN NOT NULL DEFAULT false,
    "biasCorrection" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentRatios" JSONB,
    "structuralBreakAt" TIMESTAMP(3),
    "postBreakAlpha" DOUBLE PRECISION,
    "avgFbaPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgUnitsPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "refundLagDays" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "ppcDailyAvg7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ppcDailyAvg30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forecastStdDev" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonalFactors" JSONB,
    "bootstrapSource" TEXT NOT NULL DEFAULT 'db_settlements',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonForecastCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaSecretPending" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Authenticator',
    "secret" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfaDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonForecastSnapshot" (
    "id" TEXT NOT NULL,
    "amazonAccountId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplace" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "depositEst" TEXT NOT NULL,
    "forecastGross" DOUBLE PRECISION NOT NULL,
    "forecastNet" DOUBLE PRECISION NOT NULL,
    "forecastFees" DOUBLE PRECISION NOT NULL,
    "payoutRatioPct" DOUBLE PRECISION NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "actualNet" DECIMAL(14,4),
    "actualGross" DECIMAL(14,4),
    "settlementId" TEXT,
    "errorPct" DOUBLE PRECISION,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_shopifyOrderId_key" ON "ShopifyOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_createdAt_idx" ON "ShopifyOrder"("createdAt");

-- CreateIndex
CREATE INDEX "ShopifyOrder_marketplaceDetected_idx" ON "ShopifyOrder"("marketplaceDetected");

-- CreateIndex
CREATE INDEX "ShopifyOrder_financialStatus_idx" ON "ShopifyOrder"("financialStatus");

-- CreateIndex
CREATE INDEX "ShopifyOrder_updatedAt_idx" ON "ShopifyOrder"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceRule_name_key" ON "MarketplaceRule"("name");

-- CreateIndex
CREATE INDEX "WebhookEventLog_shopifyId_idx" ON "WebhookEventLog"("shopifyId");

-- CreateIndex
CREATE INDEX "WebhookEventLog_topic_idx" ON "WebhookEventLog"("topic");

-- CreateIndex
CREATE INDEX "AppErrorLog_source_idx" ON "AppErrorLog"("source");

-- CreateIndex
CREATE INDEX "AppErrorLog_createdAt_idx" ON "AppErrorLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_shopifyLineItemId_key" ON "OrderLineItem"("shopifyLineItemId");

-- CreateIndex
CREATE INDEX "OrderLineItem_shopifyProductId_idx" ON "OrderLineItem"("shopifyProductId");

-- CreateIndex
CREATE INDEX "OrderLineItem_marketplace_idx" ON "OrderLineItem"("marketplace");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderDate_idx" ON "OrderLineItem"("orderDate");

-- CreateIndex
CREATE INDEX "OrderLineItem_sku_idx" ON "OrderLineItem"("sku");

-- CreateIndex
CREATE INDEX "ProductDailySnapshot_shopifyProductId_idx" ON "ProductDailySnapshot"("shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductDailySnapshot_snapshotDate_idx" ON "ProductDailySnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "ProductDailySnapshot_marketplace_idx" ON "ProductDailySnapshot"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailySnapshot_snapshotDate_shopifyProductId_marketpl_key" ON "ProductDailySnapshot"("snapshotDate", "shopifyProductId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAccount_sellerId_key" ON "AmazonAccount"("sellerId");

-- CreateIndex
CREATE INDEX "AmazonAccount_isActive_idx" ON "AmazonAccount"("isActive");

-- CreateIndex
CREATE INDEX "AmazonSyncJob_amazonAccountId_idx" ON "AmazonSyncJob"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonSyncJob_jobType_idx" ON "AmazonSyncJob"("jobType");

-- CreateIndex
CREATE INDEX "AmazonSyncJob_marketplace_idx" ON "AmazonSyncJob"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonSyncJob_status_idx" ON "AmazonSyncJob"("status");

-- CreateIndex
CREATE INDEX "AmazonSyncJob_startedAt_idx" ON "AmazonSyncJob"("startedAt");

-- CreateIndex
CREATE INDEX "AmazonOrder_amazonAccountId_idx" ON "AmazonOrder"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonOrder_purchaseDate_idx" ON "AmazonOrder"("purchaseDate");

-- CreateIndex
CREATE INDEX "AmazonOrder_marketplace_idx" ON "AmazonOrder"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonOrder_orderStatus_idx" ON "AmazonOrder"("orderStatus");

-- CreateIndex
CREATE INDEX "AmazonOrder_lastUpdatedDate_idx" ON "AmazonOrder"("lastUpdatedDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonOrder_amazonAccountId_amazonOrderId_key" ON "AmazonOrder"("amazonAccountId", "amazonOrderId");

-- CreateIndex
CREATE INDEX "AmazonOrderItem_amazonAccountId_idx" ON "AmazonOrderItem"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonOrderItem_asin_idx" ON "AmazonOrderItem"("asin");

-- CreateIndex
CREATE INDEX "AmazonOrderItem_sku_idx" ON "AmazonOrderItem"("sku");

-- CreateIndex
CREATE INDEX "AmazonOrderItem_marketplace_idx" ON "AmazonOrderItem"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonOrderItem_purchaseDate_idx" ON "AmazonOrderItem"("purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonOrderItem_amazonAccountId_orderItemId_key" ON "AmazonOrderItem"("amazonAccountId", "orderItemId");

-- CreateIndex
CREATE INDEX "AmazonProductSnapshot_amazonAccountId_idx" ON "AmazonProductSnapshot"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonProductSnapshot_snapshotDate_idx" ON "AmazonProductSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "AmazonProductSnapshot_asin_idx" ON "AmazonProductSnapshot"("asin");

-- CreateIndex
CREATE INDEX "AmazonProductSnapshot_marketplace_idx" ON "AmazonProductSnapshot"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonProductSnapshot_amazonAccountId_snapshotDate_asin_mar_key" ON "AmazonProductSnapshot"("amazonAccountId", "snapshotDate", "asin", "marketplace");

-- CreateIndex
CREATE INDEX "AmazonSettlement_amazonAccountId_idx" ON "AmazonSettlement"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonSettlement_marketplace_idx" ON "AmazonSettlement"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonSettlement_depositDate_idx" ON "AmazonSettlement"("depositDate");

-- CreateIndex
CREATE INDEX "AmazonSettlement_endDate_idx" ON "AmazonSettlement"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonSettlement_amazonAccountId_settlementId_key" ON "AmazonSettlement"("amazonAccountId", "settlementId");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_amazonAccountId_idx" ON "AmazonSettlementTransaction"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_orderId_idx" ON "AmazonSettlementTransaction"("orderId");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_asin_idx" ON "AmazonSettlementTransaction"("asin");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_marketplace_idx" ON "AmazonSettlementTransaction"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_postedDate_idx" ON "AmazonSettlementTransaction"("postedDate");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_settlementId_idx" ON "AmazonSettlementTransaction"("settlementId");

-- CreateIndex
CREATE INDEX "AmazonSettlementTransaction_transactionType_idx" ON "AmazonSettlementTransaction"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonSettlementTransaction_amazonAccountId_settlementId_or_key" ON "AmazonSettlementTransaction"("amazonAccountId", "settlementId", "orderId", "asin", "amountType", "transactionType");

-- CreateIndex
CREATE INDEX "AmazonProductCogs_amazonAccountId_idx" ON "AmazonProductCogs"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonProductCogs_asin_idx" ON "AmazonProductCogs"("asin");

-- CreateIndex
CREATE INDEX "AmazonProductCogs_sku_idx" ON "AmazonProductCogs"("sku");

-- CreateIndex
CREATE INDEX "AmazonProductCogs_marketplace_idx" ON "AmazonProductCogs"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonProductCogs_amazonAccountId_asin_marketplace_key" ON "AmazonProductCogs"("amazonAccountId", "asin", "marketplace");

-- CreateIndex
CREATE INDEX "AmazonCogsPriceEntry_amazonAccountId_idx" ON "AmazonCogsPriceEntry"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonCogsPriceEntry_asin_idx" ON "AmazonCogsPriceEntry"("asin");

-- CreateIndex
CREATE INDEX "AmazonCogsPriceEntry_purchaseDate_idx" ON "AmazonCogsPriceEntry"("purchaseDate");

-- CreateIndex
CREATE INDEX "AmazonCogsPriceEntry_asin_purchaseDate_idx" ON "AmazonCogsPriceEntry"("asin", "purchaseDate");

-- CreateIndex
CREATE INDEX "AmazonInventory_amazonAccountId_idx" ON "AmazonInventory"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonInventory_asin_idx" ON "AmazonInventory"("asin");

-- CreateIndex
CREATE INDEX "AmazonInventory_marketplace_idx" ON "AmazonInventory"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonInventory_sku_idx" ON "AmazonInventory"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonInventory_amazonAccountId_asin_sku_marketplace_key" ON "AmazonInventory"("amazonAccountId", "asin", "sku", "marketplace");

-- CreateIndex
CREATE INDEX "AmazonAdSnapshot_amazonAccountId_idx" ON "AmazonAdSnapshot"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonAdSnapshot_snapshotDate_idx" ON "AmazonAdSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "AmazonAdSnapshot_marketplace_idx" ON "AmazonAdSnapshot"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonAdSnapshot_campaignId_idx" ON "AmazonAdSnapshot"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdSnapshot_amazonAccountId_snapshotDate_marketplace_c_key" ON "AmazonAdSnapshot"("amazonAccountId", "snapshotDate", "marketplace", "campaignId", "adGroupId");

-- CreateIndex
CREATE INDEX "AmazonAdKeywordSnapshot_amazonAccountId_idx" ON "AmazonAdKeywordSnapshot"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonAdKeywordSnapshot_campaignId_idx" ON "AmazonAdKeywordSnapshot"("campaignId");

-- CreateIndex
CREATE INDEX "AmazonAdKeywordSnapshot_marketplace_idx" ON "AmazonAdKeywordSnapshot"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonAdKeywordSnapshot_keywordId_idx" ON "AmazonAdKeywordSnapshot"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdKeywordSnapshot_amazonAccountId_snapshotDate_market_key" ON "AmazonAdKeywordSnapshot"("amazonAccountId", "snapshotDate", "marketplace", "campaignId", "keywordId");

-- CreateIndex
CREATE INDEX "AmazonAdSearchTerm_amazonAccountId_idx" ON "AmazonAdSearchTerm"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonAdSearchTerm_marketplace_idx" ON "AmazonAdSearchTerm"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonAdSearchTerm_syncedAt_idx" ON "AmazonAdSearchTerm"("syncedAt");

-- CreateIndex
CREATE INDEX "AmazonAdSearchTerm_spend_idx" ON "AmazonAdSearchTerm"("spend");

-- CreateIndex
CREATE INDEX "AmazonAdSearchTerm_isWasted_idx" ON "AmazonAdSearchTerm"("isWasted");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdSearchTerm_amazonAccountId_marketplace_dateFrom_dat_key" ON "AmazonAdSearchTerm"("amazonAccountId", "marketplace", "dateFrom", "dateTo", "query", "keywordText", "campaignId");

-- CreateIndex
CREATE INDEX "AmazonAdKeyword_amazonAccountId_idx" ON "AmazonAdKeyword"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonAdKeyword_campaignId_idx" ON "AmazonAdKeyword"("campaignId");

-- CreateIndex
CREATE INDEX "AmazonAdKeyword_marketplace_idx" ON "AmazonAdKeyword"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAdKeyword_amazonAccountId_keywordId_marketplace_key" ON "AmazonAdKeyword"("amazonAccountId", "keywordId", "marketplace");

-- CreateIndex
CREATE INDEX "AmazonForecastCalibration_amazonAccountId_idx" ON "AmazonForecastCalibration"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonForecastCalibration_marketplace_idx" ON "AmazonForecastCalibration"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonForecastCalibration_amazonAccountId_marketplace_key" ON "AmazonForecastCalibration"("amazonAccountId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "MfaDevice_userId_idx" ON "MfaDevice"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AmazonForecastSnapshot_amazonAccountId_idx" ON "AmazonForecastSnapshot"("amazonAccountId");

-- CreateIndex
CREATE INDEX "AmazonForecastSnapshot_marketplace_idx" ON "AmazonForecastSnapshot"("marketplace");

-- CreateIndex
CREATE INDEX "AmazonForecastSnapshot_snapshotDate_idx" ON "AmazonForecastSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "AmazonForecastSnapshot_periodEnd_idx" ON "AmazonForecastSnapshot"("periodEnd");

-- CreateIndex
CREATE INDEX "AmazonForecastSnapshot_settlementId_idx" ON "AmazonForecastSnapshot"("settlementId");

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonSyncJob" ADD CONSTRAINT "AmazonSyncJob_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrder" ADD CONSTRAINT "AmazonOrder_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrderItem" ADD CONSTRAINT "AmazonOrderItem_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrderItem" ADD CONSTRAINT "AmazonOrderItem_amazonAccountId_amazonOrderId_fkey" FOREIGN KEY ("amazonAccountId", "amazonOrderId") REFERENCES "AmazonOrder"("amazonAccountId", "amazonOrderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProductSnapshot" ADD CONSTRAINT "AmazonProductSnapshot_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonSettlement" ADD CONSTRAINT "AmazonSettlement_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonSettlementTransaction" ADD CONSTRAINT "AmazonSettlementTransaction_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProductCogs" ADD CONSTRAINT "AmazonProductCogs_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonCogsPriceEntry" ADD CONSTRAINT "AmazonCogsPriceEntry_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonInventory" ADD CONSTRAINT "AmazonInventory_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonAdSnapshot" ADD CONSTRAINT "AmazonAdSnapshot_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonAdKeywordSnapshot" ADD CONSTRAINT "AmazonAdKeywordSnapshot_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonAdSearchTerm" ADD CONSTRAINT "AmazonAdSearchTerm_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonAdKeyword" ADD CONSTRAINT "AmazonAdKeyword_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonForecastCalibration" ADD CONSTRAINT "AmazonForecastCalibration_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaDevice" ADD CONSTRAINT "MfaDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonForecastSnapshot" ADD CONSTRAINT "AmazonForecastSnapshot_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
