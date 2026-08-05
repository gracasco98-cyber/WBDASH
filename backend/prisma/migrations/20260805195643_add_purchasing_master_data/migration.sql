-- CreateEnum
CREATE TYPE "PurchasePaymentMethod" AS ENUM ('BONIFICO', 'RIBA', 'ASSEGNO', 'CONTANTI', 'PAYPAL', 'CARTA', 'ALTRO');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "endOfMonth" BOOLEAN NOT NULL DEFAULT false,
    "fixedDay" INTEGER,
    "paymentMethod" "PurchasePaymentMethod" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTermInstallmentRule" (
    "id" TEXT NOT NULL,
    "paymentTermId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "PaymentTermInstallmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "openingBalance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountingCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "purchasingRole" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_isActive_idx" ON "Warehouse"("isActive");

-- CreateIndex
CREATE INDEX "PaymentTerm_isActive_idx" ON "PaymentTerm"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTermInstallmentRule_paymentTermId_installmentNumber_key" ON "PaymentTermInstallmentRule"("paymentTermId", "installmentNumber");

-- CreateIndex
CREATE INDEX "PaymentTermInstallmentRule_paymentTermId_idx" ON "PaymentTermInstallmentRule"("paymentTermId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_iban_key" ON "BankAccount"("iban");

-- CreateIndex
CREATE INDEX "BankAccount_isActive_idx" ON "BankAccount"("isActive");

-- AddForeignKey
ALTER TABLE "PaymentTermInstallmentRule" ADD CONSTRAINT "PaymentTermInstallmentRule_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
