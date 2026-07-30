import type { AmazonSettlement, AmazonSettlementTransaction } from '@prisma/client';

/**
 * Settlement fixture dataset for Amazon KPI integration tests (PR 7).
 *
 * Covers 3 marketplaces: IT, DE, FR.
 * Each settlement has realistic transaction mix: Order principal, Refund,
 * Commission, FBAPerUnitFulfillmentFee, and misc fees.
 *
 * Unique constraint on AmazonSettlementTransaction:
 *   @@unique([settlementId, orderId, asin, amountType, transactionType])
 * Strategy: vary orderId+asin per row to avoid collisions where needed.
 *
 * LOCK-IN quirks (from /dashboard endpoint):
 *   - payout_ratio = totalAmount (bank transfer) / gross_sales (Principal/Order transactions)
 *   - Commission amounts are NEGATIVE (deductions)
 *   - FBAPerUnitFulfillmentFee amounts are NEGATIVE
 *   - Refund transaction principal amounts are NEGATIVE
 *   - in-flight: orders NOT in any settlement = no AmazonSettlementTransaction(Principal/Order) for orderId
 *   - overdue: orders older than 45 days within coverage window, never settled
 *
 * Settlement SETT-IT-001 (IT marketplace):
 *   Period: 2026-03-01 to 2026-03-14, deposited 2026-03-17
 *   totalAmount: 450.00 (actual bank transfer — intentionally differs from sum of txns)
 *   Transactions gross_sales (Principal+Order) = 300+200 = 500
 *   txn sum = 300+200-45-30-18-12-60+9+6-10-3+3 = 340
 *   LOCK-IN: totalAmount (bank 450) != sum of transactions (340) — they measure different things
 *
 * Settlement SETT-DE-001 (DE marketplace):
 *   totalAmount: 280.00
 *   gross_sales = 400
 *   txn sum = 400-60-25-35 = 280 (clean match)
 *
 * Settlement SETT-FR-001 (FR marketplace):
 *   totalAmount: 200.00
 *   gross_sales = 300
 *   txn sum = 300-45-20-35 = 200 (clean match)
 *
 * Hand-computed /dashboard fee ratios (IT marketplace):
 *   gross_sales = 500, real_payout = 450
 *   payout_ratio = 450/500 = 0.90
 *   r_commission = (45+30-9)/500 = 66/500 = 0.132
 *   r_fba = (18+12-6)/500 = 24/500 = 0.048
 *   r_dsf = 10/500 = 0.02
 *   r_ads_vat = 3/500 = 0.006
 *   r_refunds = 60/500 = 0.12
 *   r_reimbursements = 3/500 = 0.006
 */

export const sampleSettlements: Omit<AmazonSettlement, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // IT settlement
  {
    settlementId: 'SETT-IT-001',
    marketplace:  'IT',
    currency:     'EUR',
    startDate:    new Date('2026-03-01T00:00:00Z'),
    endDate:      new Date('2026-03-14T23:59:59Z'),
    depositDate:  new Date('2026-03-17T00:00:00Z'),
    totalAmount:  450.00,
  },

  // DE settlement
  {
    settlementId: 'SETT-DE-001',
    marketplace:  'DE',
    currency:     'EUR',
    startDate:    new Date('2026-03-01T00:00:00Z'),
    endDate:      new Date('2026-03-14T23:59:59Z'),
    depositDate:  new Date('2026-03-17T00:00:00Z'),
    totalAmount:  280.00,
  },

  // FR settlement
  {
    settlementId: 'SETT-FR-001',
    marketplace:  'FR',
    currency:     'EUR',
    startDate:    new Date('2026-03-01T00:00:00Z'),
    endDate:      new Date('2026-03-14T23:59:59Z'),
    depositDate:  new Date('2026-03-18T00:00:00Z'),
    totalAmount:  200.00,
  },
];

export const sampleSettlementTransactions: Omit<AmazonSettlementTransaction, 'id' | 'createdAt'>[] = [
  // ── SETT-IT-001 transactions ───────────────────────────────────────────────────

  // Order principals (positive)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-A',
    asin:               'B0ASETT001A',
    sku:                'SKU-SETT-IT-A',
    marketplace:        'IT',
    amountType:         'Principal',
    amount:             300.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  2,
  },
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-B',
    asin:               'B0ASETT001B',
    sku:                'SKU-SETT-IT-B',
    marketplace:        'IT',
    amountType:         'Principal',
    amount:             200.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-07T10:00:00Z'),
    quantityPurchased:  2,
  },

  // Commission deductions (negative)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-A',
    asin:               'B0ASETT001A',
    sku:                'SKU-SETT-IT-A',
    marketplace:        'IT',
    amountType:         'Commission',
    amount:             -45.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-B',
    asin:               'B0ASETT001B',
    sku:                'SKU-SETT-IT-B',
    marketplace:        'IT',
    amountType:         'Commission',
    amount:             -30.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-07T10:00:00Z'),
    quantityPurchased:  null,
  },

  // FBA fulfillment fees (negative)
  // Use asin=null to avoid conflict with Commission rows (which use asin)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-A',
    asin:               null,
    sku:                null,
    marketplace:        'IT',
    amountType:         'FBAPerUnitFulfillmentFee',
    amount:             -18.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Order',
    orderId:            'AZ-IT-SETT-B',
    asin:               null,
    sku:                null,
    marketplace:        'IT',
    amountType:         'FBAPerUnitFulfillmentFee',
    amount:             -12.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-07T10:00:00Z'),
    quantityPurchased:  null,
  },

  // Refund — principal (negative)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Refund',
    orderId:            'AZ-IT-SETT-C',
    asin:               'B0ASETT001C',
    sku:                'SKU-SETT-IT-C',
    marketplace:        'IT',
    amountType:         'Principal',
    amount:             -60.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-10T10:00:00Z'),
    quantityPurchased:  1,
  },

  // Refund — commission returned (positive)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Refund',
    orderId:            'AZ-IT-SETT-C',
    asin:               'B0ASETT001C',
    sku:                null,
    marketplace:        'IT',
    amountType:         'Commission',
    amount:             9.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-10T10:00:00Z'),
    quantityPurchased:  null,
  },

  // Refund — FBA fee returned (positive); asin=null differs from Commission above
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'Refund',
    orderId:            'AZ-IT-SETT-C',
    asin:               null,
    sku:                null,
    marketplace:        'IT',
    amountType:         'FBAPerUnitFulfillmentFee',
    amount:             6.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-10T10:00:00Z'),
    quantityPurchased:  null,
  },

  // DigitalServicesFee (negative) — no orderId/asin to avoid constraint
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'ServiceFee',
    orderId:            null,
    asin:               null,
    sku:                null,
    marketplace:        'IT',
    amountType:         'DigitalServicesFee',
    amount:             -10.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-14T00:00:00Z'),
    quantityPurchased:  null,
  },

  // TaxAmount/ServiceFee = ads VAT (uses asin to distinguish from DigitalServicesFee)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'ServiceFee',
    orderId:            null,
    asin:               'B0ASETT001A',
    sku:                null,
    marketplace:        'IT',
    amountType:         'TaxAmount',
    amount:             -3.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-14T00:00:00Z'),
    quantityPurchased:  null,
  },

  // OtherAmount/WAREHOUSE_LOST = reimbursement (positive)
  {
    settlementId:       'SETT-IT-001',
    transactionType:    'WAREHOUSE_LOST',
    orderId:            null,
    asin:               'B0ASETT001B',
    sku:                null,
    marketplace:        'IT',
    amountType:         'OtherAmount',
    amount:             3.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-14T00:00:00Z'),
    quantityPurchased:  null,
  },

  // ── SETT-DE-001 transactions ───────────────────────────────────────────────────

  // Order principal
  {
    settlementId:       'SETT-DE-001',
    transactionType:    'Order',
    orderId:            'AZ-DE-SETT-A',
    asin:               'B0ASETT002A',
    sku:                'SKU-SETT-DE-A',
    marketplace:        'DE',
    amountType:         'Principal',
    amount:             400.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  3,
  },

  // Commission
  {
    settlementId:       'SETT-DE-001',
    transactionType:    'Order',
    orderId:            'AZ-DE-SETT-A',
    asin:               'B0ASETT002A',
    sku:                null,
    marketplace:        'DE',
    amountType:         'Commission',
    amount:             -60.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },

  // FBA fee (asin=null to avoid collision with Commission)
  {
    settlementId:       'SETT-DE-001',
    transactionType:    'Order',
    orderId:            'AZ-DE-SETT-A',
    asin:               null,
    sku:                null,
    marketplace:        'DE',
    amountType:         'FBAPerUnitFulfillmentFee',
    amount:             -25.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },

  // Advertising cost
  {
    settlementId:       'SETT-DE-001',
    transactionType:    'ServiceFee',
    orderId:            null,
    asin:               null,
    sku:                null,
    marketplace:        'DE',
    amountType:         'Cost of Advertising',
    amount:             -35.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-10T00:00:00Z'),
    quantityPurchased:  null,
  },

  // ── SETT-FR-001 transactions ───────────────────────────────────────────────────

  // Order principal
  {
    settlementId:       'SETT-FR-001',
    transactionType:    'Order',
    orderId:            'AZ-FR-SETT-A',
    asin:               'B0ASETT003A',
    sku:                'SKU-SETT-FR-A',
    marketplace:        'FR',
    amountType:         'Principal',
    amount:             300.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  2,
  },

  // Commission
  {
    settlementId:       'SETT-FR-001',
    transactionType:    'Order',
    orderId:            'AZ-FR-SETT-A',
    asin:               'B0ASETT003A',
    sku:                null,
    marketplace:        'FR',
    amountType:         'Commission',
    amount:             -45.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },

  // FBA fee
  {
    settlementId:       'SETT-FR-001',
    transactionType:    'Order',
    orderId:            'AZ-FR-SETT-A',
    asin:               null,
    sku:                null,
    marketplace:        'FR',
    amountType:         'FBAPerUnitFulfillmentFee',
    amount:             -20.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-05T10:00:00Z'),
    quantityPurchased:  null,
  },

  // Refund principal
  {
    settlementId:       'SETT-FR-001',
    transactionType:    'Refund',
    orderId:            'AZ-FR-SETT-B',
    asin:               'B0ASETT003B',
    sku:                null,
    marketplace:        'FR',
    amountType:         'Principal',
    amount:             -35.00,
    currency:           'EUR',
    postedDate:         new Date('2026-03-12T10:00:00Z'),
    quantityPurchased:  1,
  },
];
