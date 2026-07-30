# Fase 1 — Dashboard Vendite e Profitti

Priorità assoluta della Release 1. Dipende dal completamento della Fase 0 (fondamenta, vedi `../PROJECT_SPEC.md`). Non iniziare l'implementazione di questa fase finché Fase 0 non è approvata.

## 1. Obiettivo

Dare visibilità affidabile e aggiornata su vendite e profitto reale su Amazon, multi-account e multi-marketplace (IT, DE, FR, ES), con aggiornamento almeno ogni 30 minuti.

## 2. Funzionalità

- Collegamento account Amazon SP-API (OAuth, gestione credenziali cifrate).
- Gestione multi seller-account.
- Gestione multi-marketplace (IT, DE, FR, ES).
- Sincronizzazione ordini ogni 30 minuti.
- Sincronizzazione transazioni finanziarie.
- Importazione report (inventario, advertising).
- Inserimento costo prodotto (costo standard, costo medio ponderato).
- Caricamento costi advertising.
- Calcolo profitto stimato e consolidato.
- Dashboard giornaliera con confronto: ieri, settimana precedente, mese precedente.
- Filtri: marketplace, account, brand, prodotto/SKU/ASIN, intervallo temporale, valuta.

## 3. KPI Release 1

Fatturato, Ordini, Unità vendute, Profitto, Margine %, Advertising spend, ACOS, TACOS, ROAS, Costo merce, Commissioni Amazon, Costi FBA, Rimborsi, Prezzo medio, Profitto per unità.

Ogni KPI mostrato in dashboard deve esporre: valore, variazione assoluta, variazione percentuale, **stato di completezza dei dati** (stimato/consolidato/riconciliato — vedi `PROJECT_SPEC.md` §4), ultimo aggiornamento.

## 4. Stati dei dati (obbligatorio in UI)

Non mostrare mai un solo numero senza indicarne l'affidabilità:

- **Provvisorio**: solo ordini, senza dati finanziari né costi completi.
- **Stimato**: ordini + costo prodotto, advertising eventualmente mancante.
- **Consolidato**: transazioni finanziarie arrivate (Finances API).
- **Riconciliato**: verificato con settlement/fatture (post Release 1, ma il campo va previsto da subito nello schema).

## 5. Backlog atomico — branch consigliate

Ordine consigliato, ogni riga è una branch `feature/*` indipendente e verificabile:

1. `feature/project-foundation` — scaffolding monorepo (pnpm + Turborepo), apps/packages vuoti, lint/format/tsconfig condivisi, Docker Compose (Postgres, Redis, MinIO).
2. `feature/database-bootstrap` — Prisma init, primo schema (organizations, users, roles), prima migrazione, seed di sviluppo.
3. `feature/authentication` — Auth.js, login, sessione, RBAC di base.
4. `feature/amazon-sp-api-auth` — modulo `amazon-integration`: onboarding account Amazon (OAuth), tabelle `amazon_accounts`/`amazon_credentials`/`marketplaces`/`amazon_account_marketplaces`, cifratura credenziali.
5. `feature/sync-job-infrastructure` — modulo `synchronization`: `sync_jobs`, `sync_cursors`, coda BullMQ, worker NestJS, stati job, retry/backoff.
6. `feature/amazon-orders-sync` — client `amazon-sp-api` per Orders API, `raw_api_events`, normalizzazione in `orders`/`order_items`/`order_status_history`, idempotenza su `(amazonAccountId, amazonOrderId)`.
7. `feature/amazon-finances-sync` — Finances API, `raw_financial_events`, `financial_transactions`, `fees`, `refunds`, `reimbursements`.
8. `feature/amazon-reports-sync` — Reports API per inventario e advertising, `raw_reports`, `advertising_costs`.
9. `feature/product-costs` — modulo `products` + `product-costs`: anagrafica minima, `product_marketplace_identifiers`, `product_cost_history` (costo standard e medio ponderato).
10. `feature/profit-calculation-engine` — package `profit-engine` isolato: formula versionata, fixture di test (vedi `PROJECT_SPEC.md` §9), `profit_calculations` append-only, stati stimato/consolidato.
11. `feature/daily-metrics-aggregation` — job di aggregazione `daily_metrics`, invalidazione cache Redis, ricalcolo su intervalli passati per dati in ritardo.
12. `feature/dashboard-overview` — frontend Next.js: dashboard principale, KPI card con stato di completezza, grafico andamento (Recharts).
13. `feature/dashboard-marketplace-filter` — filtri marketplace/account/brand/prodotto/SKU/ASIN/periodo/valuta.
14. `feature/dashboard-period-comparison` — confronto ieri/settimana precedente/mese precedente.
15. `feature/scheduler-30min` — job schedulato end-to-end che orchestra sync ordini/finanze/report ogni 30 minuti, osservabilità (log strutturati, correlation ID).
16. `feature/observability-baseline` — Sentry, dashboard di salute dei job, dead letter queue.

Ogni branch richiede: test propri, lint/typecheck/build verdi, migrazione + rollback documentati (o esplicitamente "nessuna modifica database").

## 6. Fuori scope per Release 1

Magazzino/ledger, fornitori, ordini di acquisto, fatture/prima nota/scadenzario, listing e marketing, indici di intelligence (Fase 2+). Questi moduli sono solo nominati nell'architettura modulare per evitare scelte che li ostacolino in futuro, ma non vanno implementati ora.
