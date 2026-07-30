import type { AmazonOrder, AmazonOrderItem } from '@prisma/client';

/**
 * Fixture dataset for Amazon KPI integration tests (PR 7).
 *
 * Reference "now" used in tests: 2026-04-15T10:00:00Z (CEST = UTC+2 in April).
 * Italy midnight on 2026-04-15 = 2026-04-14T22:00:00Z
 *
 * Key quirks (LOCK-IN):
 *   - Amazon /summary excludes orderStatus IN ('Canceled','Cancelled') — OPPOSITE of Shopify
 *   - Amazon /summary also excludes salesChannel = 'Non-Amazon'
 *   - Revenue = SUM(itemPrice) from AmazonOrderItem (joined), NOT AmazonOrder.itemTotal
 *   - AmazonOrderItem.amazonOrderId is a FK to AmazonOrder.amazonOrderId (string ID, not cuid)
 *
 * Amazon getDateRange for last7 with ref time 2026-04-15T10:00Z:
 *   gte = Date.now() - 7*86400000 - italyOffsetMs()
 *       = 2026-04-15T10:00Z - 604800000ms - 7200000ms
 *       = 2026-04-08T08:00:00Z   (Italy offset subtracted — different from Shopify!)
 *   lte = todayEnd = italyDayStart(now) + 86400000 - 1ms
 *       = 2026-04-14T22:00:00Z + 86400000ms - 1ms = 2026-04-15T21:59:59.999Z
 *
 * Hand-computed expected KPIs (last30, all marketplaces combined, non-cancelled, Amazon-only):
 *   IT: orderCount=5, grossRevenue=90+30+75+120+70=385, units=2+1+3+1+2=9
 *   DE: orderCount=3, grossRevenue=80+100+45=225, units=1+2+1=4
 *   FR: orderCount=2, grossRevenue=80+55=135, units=2+1=3
 *   ES: orderCount=2, grossRevenue=60+60=120, units=1+2=3
 *   TOTAL: orderCount=12, grossRevenue=865, units=19
 *   (AZ-IT-OLD outside last30; AZ-IT-CANCEL excluded; AZ-IT-NONAMAZON excluded)
 *
 * today (>= 2026-04-14T22:00:00Z):
 *   AZ-IT-004 (2026-04-14T22:30Z) → IT, grossRevenue=120, units=1
 *
 * yesterday (>= 2026-04-13T22:00:00Z AND < 2026-04-14T22:00:00Z):
 *   AZ-IT-005 (2026-04-13T23:00Z) → IT, grossRevenue=70, units=2
 *
 * LOCK-IN: Cancelled/Canceled orders ARE excluded (vs Shopify where they are included)
 * LOCK-IN: Non-Amazon salesChannel excluded
 * LOCK-IN: Revenue = SUM(i."itemPrice") not AmazonOrder.itemTotal
 * LOCK-IN: isBusinessOrder does NOT affect KPI filtering
 */

export const sampleAmazonOrders: Omit<AmazonOrder, 'id' | 'syncedAt' | 'updatedAt'>[] = [
  // ── IT marketplace ────────────────────────────────────────────────────────────

  // AZ-IT-001: Regular Shipped FBA order, 2026-04-10
  {
    amazonOrderId:      'AZ-IT-001',
    purchaseDate:       new Date('2026-04-10T09:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-10T09:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          90.00,
    isBusinessOrder:    false,
  },

  // AZ-IT-002: Unshipped — LOCK-IN: 'Unshipped' IS included in /summary (not in exclusion list)
  {
    amazonOrderId:      'AZ-IT-002',
    purchaseDate:       new Date('2026-04-11T14:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-11T14:00:00Z'),
    orderStatus:        'Unshipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          30.00,
    isBusinessOrder:    false,
  },

  // AZ-IT-003: Shipped FBM (MFN) order
  {
    amazonOrderId:      'AZ-IT-003',
    purchaseDate:       new Date('2026-04-12T10:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-12T10:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'MFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          75.00,
    isBusinessOrder:    false,
  },

  // AZ-IT-004: Today's order (2026-04-14T22:30Z = Italy 2026-04-15T00:30)
  {
    amazonOrderId:      'AZ-IT-004',
    purchaseDate:       new Date('2026-04-14T22:30:00Z'),
    lastUpdatedDate:    new Date('2026-04-14T22:30:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          120.00,
    isBusinessOrder:    false,
  },

  // AZ-IT-005: Yesterday (2026-04-13T23:00Z = Italy 2026-04-14T01:00 = yesterday relative to ref-now)
  {
    amazonOrderId:      'AZ-IT-005',
    purchaseDate:       new Date('2026-04-13T23:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-13T23:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          70.00,
    isBusinessOrder:    false,
  },

  // ── DE marketplace ────────────────────────────────────────────────────────────

  // AZ-DE-001: Regular Shipped FBA
  {
    amazonOrderId:      'AZ-DE-001',
    purchaseDate:       new Date('2026-04-09T08:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-09T08:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.de',
    marketplace:        'DE',
    fulfillmentChannel: 'AFN',
    shipCountry:        'DE',
    currency:           'EUR',
    itemTotal:          80.00,
    isBusinessOrder:    false,
  },

  // AZ-DE-002: Business (B2B) order — LOCK-IN: isBusinessOrder does NOT filter out
  {
    amazonOrderId:      'AZ-DE-002',
    purchaseDate:       new Date('2026-04-11T10:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-11T10:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.de',
    marketplace:        'DE',
    fulfillmentChannel: 'AFN',
    shipCountry:        'DE',
    currency:           'EUR',
    itemTotal:          100.00,
    isBusinessOrder:    true,  // B2B — still included in KPIs
  },

  // AZ-DE-003: Regular Shipped
  {
    amazonOrderId:      'AZ-DE-003',
    purchaseDate:       new Date('2026-04-12T15:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-12T15:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.de',
    marketplace:        'DE',
    fulfillmentChannel: 'AFN',
    shipCountry:        'DE',
    currency:           'EUR',
    itemTotal:          45.00,
    isBusinessOrder:    false,
  },

  // ── FR marketplace ────────────────────────────────────────────────────────────

  // AZ-FR-001
  {
    amazonOrderId:      'AZ-FR-001',
    purchaseDate:       new Date('2026-04-10T11:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-10T11:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.fr',
    marketplace:        'FR',
    fulfillmentChannel: 'AFN',
    shipCountry:        'FR',
    currency:           'EUR',
    itemTotal:          80.00,
    isBusinessOrder:    false,
  },

  // AZ-FR-002
  {
    amazonOrderId:      'AZ-FR-002',
    purchaseDate:       new Date('2026-04-13T08:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-13T08:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.fr',
    marketplace:        'FR',
    fulfillmentChannel: 'AFN',
    shipCountry:        'FR',
    currency:           'EUR',
    itemTotal:          55.00,
    isBusinessOrder:    false,
  },

  // ── ES marketplace ────────────────────────────────────────────────────────────

  // AZ-ES-001: Exactly at last7 lower bound with Italy offset
  // last7 gte = Date.now() - 7*86400000 - italyOffsetMs()
  //           = 2026-04-15T10:00Z - 604800000ms - 7200000ms = 2026-04-08T08:00:00Z
  // Order at 2026-04-08T08:00:00Z is exactly at gte boundary → included
  {
    amazonOrderId:      'AZ-ES-001',
    purchaseDate:       new Date('2026-04-08T08:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-08T08:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.es',
    marketplace:        'ES',
    fulfillmentChannel: 'AFN',
    shipCountry:        'ES',
    currency:           'EUR',
    itemTotal:          60.00,
    isBusinessOrder:    false,
  },

  // AZ-ES-002
  {
    amazonOrderId:      'AZ-ES-002',
    purchaseDate:       new Date('2026-04-11T16:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-11T16:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.es',
    marketplace:        'ES',
    fulfillmentChannel: 'AFN',
    shipCountry:        'ES',
    currency:           'EUR',
    itemTotal:          60.00,
    isBusinessOrder:    false,
  },

  // ── EXCLUDED orders ───────────────────────────────────────────────────────────

  // LOCK-IN: Cancelled → excluded from /summary (WHERE NOT IN ('Canceled','Cancelled'))
  {
    amazonOrderId:      'AZ-IT-CANCEL',
    purchaseDate:       new Date('2026-04-10T12:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-10T13:00:00Z'),
    orderStatus:        'Cancelled',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          999.00,
    isBusinessOrder:    false,
  },

  // LOCK-IN: salesChannel='Non-Amazon' → excluded (WHERE salesChannel != 'Non-Amazon')
  {
    amazonOrderId:      'AZ-IT-NONAMAZON',
    purchaseDate:       new Date('2026-04-10T12:00:00Z'),
    lastUpdatedDate:    new Date('2026-04-10T12:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Non-Amazon',
    marketplace:        'IT',
    fulfillmentChannel: 'MFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          888.00,
    isBusinessOrder:    false,
  },

  // Old order — way outside all windows (sentinel for empty-period tests)
  {
    amazonOrderId:      'AZ-IT-OLD',
    purchaseDate:       new Date('2025-01-01T00:00:00Z'),
    lastUpdatedDate:    new Date('2025-01-01T00:00:00Z'),
    orderStatus:        'Shipped',
    salesChannel:       'Amazon.it',
    marketplace:        'IT',
    fulfillmentChannel: 'AFN',
    shipCountry:        'IT',
    currency:           'EUR',
    itemTotal:          10.00,
    isBusinessOrder:    false,
  },
];

/**
 * AmazonOrderItem fixtures.
 *
 * Each item references amazonOrderId (string ID, not cuid).
 * /summary revenue = SUM(i."itemPrice") — this is the KPI source.
 *
 * Items per order:
 *   AZ-IT-001:       2 items × €45.00 = €90.00, qty=2
 *   AZ-IT-002:       1 item  × €30.00 = €30.00, qty=1
 *   AZ-IT-003:       1 item  (qty=3)  × €75.00 = €75.00, qty=3  (stored as total in itemPrice)
 *   AZ-IT-004:       1 item  × €120.00= €120.00, qty=1
 *   AZ-IT-005:       2 items × €35.00 = €70.00, qty=2
 *   AZ-DE-001:       1 item  × €80.00 = €80.00, qty=1
 *   AZ-DE-002:       2 items × €50.00 = €100.00, qty=2
 *   AZ-DE-003:       1 item  × €45.00 = €45.00, qty=1
 *   AZ-FR-001:       2 items × €40.00 = €80.00, qty=2
 *   AZ-FR-002:       1 item  × €55.00 = €55.00, qty=1
 *   AZ-ES-001:       1 item  × €60.00 = €60.00, qty=1
 *   AZ-ES-002:       2 items × €30.00 = €60.00, qty=2
 *   AZ-IT-CANCEL:    1 item  × €999.00 (EXCLUDED)
 *   AZ-IT-NONAMAZON: 1 item  × €888.00 (EXCLUDED)
 *   AZ-IT-OLD:       1 item  × €10.00  (EXCLUDED — outside window)
 */
export const sampleAmazonOrderItems: Omit<AmazonOrderItem, 'id'>[] = [
  // AZ-IT-001 items (2 × €45)
  {
    amazonOrderId:     'AZ-IT-001',
    orderItemId:       'ITEM-IT001-A',
    asin:              'B0A1IT001A',
    sku:               'SKU-IT001-A',
    productTitle:      'Prodotto IT 001 A',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         45.00,
    itemTax:           9.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-10T09:00:00Z'),
  },
  {
    amazonOrderId:     'AZ-IT-001',
    orderItemId:       'ITEM-IT001-B',
    asin:              'B0A1IT001B',
    sku:               'SKU-IT001-B',
    productTitle:      'Prodotto IT 001 B',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         45.00,
    itemTax:           9.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-10T09:00:00Z'),
  },

  // AZ-IT-002 item (1 × €30)
  {
    amazonOrderId:     'AZ-IT-002',
    orderItemId:       'ITEM-IT002-A',
    asin:              'B0A1IT002A',
    sku:               'SKU-IT002-A',
    productTitle:      'Prodotto IT 002 A',
    quantityOrdered:   1,
    quantityShipped:   0,
    itemPrice:         30.00,
    itemTax:           6.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-11T14:00:00Z'),
  },

  // AZ-IT-003 item (qty=3, itemPrice=€75 total)
  {
    amazonOrderId:     'AZ-IT-003',
    orderItemId:       'ITEM-IT003-A',
    asin:              'B0A1IT003A',
    sku:               'SKU-IT003-A',
    productTitle:      'Prodotto IT 003 FBM',
    quantityOrdered:   3,
    quantityShipped:   3,
    itemPrice:         75.00,
    itemTax:           15.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-12T10:00:00Z'),
  },

  // AZ-IT-004 item (1 × €120)
  {
    amazonOrderId:     'AZ-IT-004',
    orderItemId:       'ITEM-IT004-A',
    asin:              'B0A1IT004A',
    sku:               'SKU-IT004-A',
    productTitle:      'Prodotto IT 004 Today',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         120.00,
    itemTax:           24.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-14T22:30:00Z'),
  },

  // AZ-IT-005 items (2 × €35)
  {
    amazonOrderId:     'AZ-IT-005',
    orderItemId:       'ITEM-IT005-A',
    asin:              'B0A1IT005A',
    sku:               'SKU-IT005-A',
    productTitle:      'Prodotto IT 005 Yesterday A',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         35.00,
    itemTax:           7.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-13T23:00:00Z'),
  },
  {
    amazonOrderId:     'AZ-IT-005',
    orderItemId:       'ITEM-IT005-B',
    asin:              'B0A1IT005B',
    sku:               'SKU-IT005-B',
    productTitle:      'Prodotto IT 005 Yesterday B',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         35.00,
    itemTax:           7.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-13T23:00:00Z'),
  },

  // AZ-DE-001 item (1 × €80)
  {
    amazonOrderId:     'AZ-DE-001',
    orderItemId:       'ITEM-DE001-A',
    asin:              'B0A1DE001A',
    sku:               'SKU-DE001-A',
    productTitle:      'Produkt DE 001',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         80.00,
    itemTax:           12.80,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'DE',
    purchaseDate:      new Date('2026-04-09T08:00:00Z'),
  },

  // AZ-DE-002 items (2 × €50)
  {
    amazonOrderId:     'AZ-DE-002',
    orderItemId:       'ITEM-DE002-A',
    asin:              'B0A1DE002A',
    sku:               'SKU-DE002-A',
    productTitle:      'Produkt DE 002 Business A',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         50.00,
    itemTax:           0,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'DE',
    purchaseDate:      new Date('2026-04-11T10:00:00Z'),
  },
  {
    amazonOrderId:     'AZ-DE-002',
    orderItemId:       'ITEM-DE002-B',
    asin:              'B0A1DE002B',
    sku:               'SKU-DE002-B',
    productTitle:      'Produkt DE 002 Business B',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         50.00,
    itemTax:           0,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'DE',
    purchaseDate:      new Date('2026-04-11T10:00:00Z'),
  },

  // AZ-DE-003 item (1 × €45)
  {
    amazonOrderId:     'AZ-DE-003',
    orderItemId:       'ITEM-DE003-A',
    asin:              'B0A1DE003A',
    sku:               'SKU-DE003-A',
    productTitle:      'Produkt DE 003',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         45.00,
    itemTax:           7.20,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'DE',
    purchaseDate:      new Date('2026-04-12T15:00:00Z'),
  },

  // AZ-FR-001 items (2 × €40)
  {
    amazonOrderId:     'AZ-FR-001',
    orderItemId:       'ITEM-FR001-A',
    asin:              'B0A1FR001A',
    sku:               'SKU-FR001-A',
    productTitle:      'Produit FR 001 A',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         40.00,
    itemTax:           8.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'FR',
    purchaseDate:      new Date('2026-04-10T11:00:00Z'),
  },
  {
    amazonOrderId:     'AZ-FR-001',
    orderItemId:       'ITEM-FR001-B',
    asin:              'B0A1FR001B',
    sku:               'SKU-FR001-B',
    productTitle:      'Produit FR 001 B',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         40.00,
    itemTax:           8.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'FR',
    purchaseDate:      new Date('2026-04-10T11:00:00Z'),
  },

  // AZ-FR-002 item (1 × €55)
  {
    amazonOrderId:     'AZ-FR-002',
    orderItemId:       'ITEM-FR002-A',
    asin:              'B0A1FR002A',
    sku:               'SKU-FR002-A',
    productTitle:      'Produit FR 002',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         55.00,
    itemTax:           11.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'FR',
    purchaseDate:      new Date('2026-04-13T08:00:00Z'),
  },

  // AZ-ES-001 item (1 × €60) — at last7 boundary
  {
    amazonOrderId:     'AZ-ES-001',
    orderItemId:       'ITEM-ES001-A',
    asin:              'B0A1ES001A',
    sku:               'SKU-ES001-A',
    productTitle:      'Producto ES 001',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         60.00,
    itemTax:           12.60,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'ES',
    purchaseDate:      new Date('2026-04-08T08:00:00Z'),
  },

  // AZ-ES-002 items (2 × €30)
  {
    amazonOrderId:     'AZ-ES-002',
    orderItemId:       'ITEM-ES002-A',
    asin:              'B0A1ES002A',
    sku:               'SKU-ES002-A',
    productTitle:      'Producto ES 002 A',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         30.00,
    itemTax:           6.30,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'ES',
    purchaseDate:      new Date('2026-04-11T16:00:00Z'),
  },
  {
    amazonOrderId:     'AZ-ES-002',
    orderItemId:       'ITEM-ES002-B',
    asin:              'B0A1ES002B',
    sku:               'SKU-ES002-B',
    productTitle:      'Producto ES 002 B',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         30.00,
    itemTax:           6.30,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'ES',
    purchaseDate:      new Date('2026-04-11T16:00:00Z'),
  },

  // AZ-IT-CANCEL item (EXCLUDED — cancelled order)
  {
    amazonOrderId:     'AZ-IT-CANCEL',
    orderItemId:       'ITEM-CANCEL-A',
    asin:              'B0ACANCEL1A',
    sku:               'SKU-CANCEL-A',
    productTitle:      'Cancelled Product',
    quantityOrdered:   1,
    quantityShipped:   0,
    itemPrice:         999.00,
    itemTax:           0,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-10T12:00:00Z'),
  },

  // AZ-IT-NONAMAZON item (EXCLUDED — Non-Amazon channel)
  {
    amazonOrderId:     'AZ-IT-NONAMAZON',
    orderItemId:       'ITEM-NONAMAZON-A',
    asin:              'B0ANONAMZN1',
    sku:               'SKU-NONAMAZON-A',
    productTitle:      'Non-Amazon Product',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         888.00,
    itemTax:           0,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2026-04-10T12:00:00Z'),
  },

  // AZ-IT-OLD item (EXCLUDED — outside date window)
  {
    amazonOrderId:     'AZ-IT-OLD',
    orderItemId:       'ITEM-OLD-A',
    asin:              'B0AOLD00001',
    sku:               'SKU-OLD-A',
    productTitle:      'Old Product 2025',
    quantityOrdered:   1,
    quantityShipped:   1,
    itemPrice:         10.00,
    itemTax:           2.00,
    promotionDiscount: 0,
    currency:          'EUR',
    marketplace:       'IT',
    purchaseDate:      new Date('2025-01-01T00:00:00Z'),
  },
];
