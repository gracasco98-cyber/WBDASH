-- CreateTable
CREATE TABLE "BusinessContact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referent" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessContact_type_idx" ON "BusinessContact"("type");

-- CreateIndex
CREATE INDEX "BusinessContact_isActive_idx" ON "BusinessContact"("isActive");
