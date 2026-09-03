-- CreateTable
CREATE TABLE "BankMovement" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "category" TEXT,
    "documentNumber" TEXT,
    "dare" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "avere" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(14,4),
    "status" TEXT NOT NULL DEFAULT 'BOZZA',
    "vatRate" DECIMAL(5,2),
    "accountingCode" TEXT,
    "notes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankMovementAttachment" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankMovementAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankMovement_bankAccountId_movementDate_idx" ON "BankMovement"("bankAccountId", "movementDate");
CREATE INDEX "BankMovement_status_idx" ON "BankMovement"("status");
CREATE INDEX "BankMovement_category_idx" ON "BankMovement"("category");
CREATE INDEX "BankMovementAttachment_movementId_idx" ON "BankMovementAttachment"("movementId");

ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankMovementAttachment" ADD CONSTRAINT "BankMovementAttachment_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "BankMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
