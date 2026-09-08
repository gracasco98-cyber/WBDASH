-- Redcare advertiser report imported on 2026-09-08.
-- Values are daily sums of budgetSpend across campaigns in the supplied CSV.
INSERT INTO "MarketplaceAdSpend"
  ("id", "spendDate", "marketplace", "amount", "currency", "source", "note", "createdAt", "updatedAt")
SELECT
  'redcare-csv-' || v.spend_date::text,
  v.spend_date,
  'REDCARE_IT',
  v.amount,
  'EUR',
  'SA_TECH_CSV',
  'advertiser-report-d44966e4-bcd1-4bb4-9b5a-3a0a2b1dfb29.csv',
  NOW(),
  NOW()
FROM (VALUES
  ('2026-08-11'::date, 0.2000::numeric), ('2026-08-12'::date, 1.2000::numeric),
  ('2026-08-13'::date, 8.7000::numeric), ('2026-08-14'::date, 6.1600::numeric),
  ('2026-08-15'::date, 2.3100::numeric), ('2026-08-16'::date, 6.3600::numeric),
  ('2026-08-17'::date, 7.1300::numeric), ('2026-08-18'::date, 7.9000::numeric),
  ('2026-08-19'::date, 18.4800::numeric), ('2026-08-20'::date, 17.7100::numeric),
  ('2026-08-21'::date, 21.5600::numeric), ('2026-08-22'::date, 22.3300::numeric),
  ('2026-08-23'::date, 20.7900::numeric), ('2026-08-24'::date, 26.9500::numeric),
  ('2026-08-25'::date, 29.2600::numeric), ('2026-08-26'::date, 23.1000::numeric),
  ('2026-08-27'::date, 25.4100::numeric), ('2026-08-28'::date, 24.6400::numeric),
  ('2026-08-29'::date, 22.3300::numeric), ('2026-08-30'::date, 23.8700::numeric),
  ('2026-08-31'::date, 27.7200::numeric), ('2026-09-01'::date, 30.0300::numeric),
  ('2026-09-02'::date, 27.7200::numeric), ('2026-09-03'::date, 26.1800::numeric),
  ('2026-09-04'::date, 26.1800::numeric), ('2026-09-05'::date, 24.6400::numeric),
  ('2026-09-06'::date, 23.6400::numeric), ('2026-09-07'::date, 23.4000::numeric),
  ('2026-09-08'::date, 7.8000::numeric)
) AS v(spend_date, amount)
ON CONFLICT ("spendDate", "marketplace") DO UPDATE SET
  "amount" = EXCLUDED."amount",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = NOW();
