CREATE TABLE "Strategy" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sourceText" TEXT NOT NULL,
  "summary" TEXT,
  "coreConcept" TEXT,
  "objectives" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");
CREATE INDEX "Strategy_createdAt_idx" ON "Strategy"("createdAt");
