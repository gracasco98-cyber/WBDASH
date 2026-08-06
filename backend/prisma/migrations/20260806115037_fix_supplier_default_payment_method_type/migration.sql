ALTER TABLE "Supplier"
  ALTER COLUMN "defaultPaymentMethod" TYPE "PurchasePaymentMethod"
  USING "defaultPaymentMethod"::"PurchasePaymentMethod";
