ALTER TABLE "WebhookEventLog" ADD COLUMN "webhookId" TEXT;
CREATE UNIQUE INDEX "WebhookEventLog_webhookId_key" ON "WebhookEventLog"("webhookId");
