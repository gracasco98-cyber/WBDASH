-- Redcare advertiser report imported on 2026-09-23.
-- Values are daily sums of budgetSpend across campaigns in the supplied CSV,
-- rounded to the MarketplaceAdSpend column precision (four decimal places).
INSERT INTO "MarketplaceAdSpend"
  ("id", "spendDate", "marketplace", "amount", "currency", "source", "note", "createdAt", "updatedAt")
SELECT
  'redcare-csv-' || v.spend_date::text,
  v.spend_date,
  'REDCARE_IT',
  v.amount,
  'EUR',
  'SA_TECH_CSV',
  'advertiser-report-9c20cb70-90eb-4a7b-82d8-c37864116873.csv',
  NOW(),
  NOW()
FROM (VALUES
  ('2026-09-01'::date, 30.0300::numeric), ('2026-09-02'::date, 27.7200::numeric),
  ('2026-09-03'::date, 26.1800::numeric), ('2026-09-04'::date, 26.1800::numeric),
  ('2026-09-05'::date, 24.6400::numeric), ('2026-09-06'::date, 23.6400::numeric),
  ('2026-09-07'::date, 23.4000::numeric), ('2026-09-08'::date, 13.2000::numeric),
  ('2026-09-09'::date, 5.9022::numeric),  ('2026-09-10'::date, 3.5513::numeric),
  ('2026-09-11'::date, 3.1978::numeric),  ('2026-09-12'::date, 3.7063::numeric),
  ('2026-09-13'::date, 4.8642::numeric),  ('2026-09-14'::date, 4.7532::numeric),
  ('2026-09-15'::date, 5.5926::numeric),  ('2026-09-16'::date, 9.9998::numeric),
  ('2026-09-17'::date, 7.7282::numeric),  ('2026-09-18'::date, 5.4801::numeric),
  ('2026-09-19'::date, 8.1473::numeric),  ('2026-09-20'::date, 19.0705::numeric),
  ('2026-09-21'::date, 18.4940::numeric), ('2026-09-22'::date, 14.9388::numeric),
  ('2026-09-23'::date, 7.9676::numeric)
) AS v(spend_date, amount)
ON CONFLICT ("spendDate", "marketplace") DO UPDATE SET
  "amount" = EXCLUDED."amount",
  "currency" = EXCLUDED."currency",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = NOW();
