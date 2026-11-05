-- Redcare advertiser report imported on 2026-11-05.
-- Values are daily sums of budgetSpend across campaigns in the supplied CSV,
-- rounded to the MarketplaceAdSpend column precision (four decimal places).
-- The report covers 2026-09-01..2026-11-05; days up to 2026-09-22 match the
-- previous import and are left untouched. 2026-09-23 was partial in the
-- previous report and is overwritten with the final value.
INSERT INTO "MarketplaceAdSpend"
  ("id", "spendDate", "marketplace", "amount", "currency", "source", "note", "createdAt", "updatedAt")
SELECT
  'redcare-csv-' || v.spend_date::text,
  v.spend_date,
  'REDCARE_IT',
  v.amount,
  'EUR',
  'SA_TECH_CSV',
  'advertiser-report-d79d88c0-abe9-4834-89e9-c659be9fde03.csv',
  NOW(),
  NOW()
FROM (VALUES
  ('2026-09-23'::date, 14.9375::numeric), ('2026-09-24'::date, 9.7320::numeric),
  ('2026-09-25'::date, 10.3766::numeric), ('2026-09-26'::date, 8.7317::numeric),
  ('2026-09-27'::date, 2.1902::numeric), ('2026-09-28'::date, 0.0000::numeric),
  ('2026-09-29'::date, 0.0000::numeric), ('2026-09-30'::date, 0.5453::numeric),
  ('2026-10-05'::date, 2.1000::numeric), ('2026-10-06'::date, 3.0000::numeric),
  ('2026-10-07'::date, 4.9000::numeric), ('2026-10-08'::date, 0.8000::numeric),
  ('2026-10-09'::date, 2.8000::numeric), ('2026-10-10'::date, 2.0000::numeric),
  ('2026-10-11'::date, 0.8000::numeric), ('2026-10-12'::date, 1.6000::numeric),
  ('2026-10-13'::date, 4.4000::numeric), ('2026-10-14'::date, 4.0000::numeric),
  ('2026-10-15'::date, 7.3000::numeric), ('2026-10-16'::date, 3.2000::numeric),
  ('2026-10-17'::date, 0.8000::numeric), ('2026-10-18'::date, 4.3000::numeric),
  ('2026-10-19'::date, 5.1000::numeric), ('2026-10-20'::date, 4.8000::numeric),
  ('2026-10-21'::date, 1.8000::numeric), ('2026-10-22'::date, 5.1000::numeric),
  ('2026-10-23'::date, 3.3000::numeric), ('2026-10-24'::date, 4.5000::numeric),
  ('2026-10-25'::date, 11.7000::numeric), ('2026-10-26'::date, 12.3000::numeric),
  ('2026-10-27'::date, 5.4000::numeric), ('2026-10-28'::date, 9.2000::numeric),
  ('2026-10-29'::date, 4.8000::numeric), ('2026-10-30'::date, 4.5000::numeric),
  ('2026-10-31'::date, 7.2000::numeric), ('2026-11-01'::date, 4.4000::numeric),
  ('2026-11-02'::date, 9.0000::numeric), ('2026-11-03'::date, 8.7000::numeric),
  ('2026-11-04'::date, 6.3000::numeric), ('2026-11-05'::date, 5.4000::numeric)
) AS v(spend_date, amount)
ON CONFLICT ("spendDate", "marketplace") DO UPDATE SET
  "amount" = EXCLUDED."amount",
  "currency" = EXCLUDED."currency",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = NOW();
