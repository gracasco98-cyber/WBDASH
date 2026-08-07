-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "internalCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierType" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "vatNumber" TEXT,
    "taxCode" TEXT,
    "foreignVatNumber" TEXT,
    "sdiCode" TEXT,
    "pec" TEXT,
    "taxRegime" TEXT,
    "fiscalNotes" TEXT,
    "addressLine" TEXT,
    "streetNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "addressCountry" TEXT,
    "defaultPaymentMethod" TEXT,
    "defaultPaymentTermId" TEXT,
    "paymentDays" INTEGER,
    "bankName" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "ribaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fixedPaymentDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "supplierProductName" TEXT,
    "standardPrice" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "moq" INTEGER,
    "orderMultiple" INTEGER,
    "leadTimeDays" INTEGER,
    "unitsPerCarton" INTEGER,
    "unitsPerPallet" INTEGER,
    "weightKg" DECIMAL(10,3),
    "conditions" TEXT,
    "lastPriceDate" TIMESTAMP(3) NOT NULL,
    "isPreferredSupplier" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProductPriceHistory" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "price" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "SupplierProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_internalCode_key" ON "Supplier"("internalCode");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "Supplier_vatNumber_idx" ON "Supplier"("vatNumber");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId", "productId");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierProduct_productId_idx" ON "SupplierProduct"("productId");

-- CreateIndex
CREATE INDEX "SupplierProductPriceHistory_supplierProductId_validFrom_idx" ON "SupplierProductPriceHistory"("supplierProductId", "validFrom");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_defaultPaymentTermId_fkey" FOREIGN KEY ("defaultPaymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductPriceHistory" ADD CONSTRAINT "SupplierProductPriceHistory_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
