# WBDASH — Project Spec

Piattaforma gestionale e di business intelligence per aziende che vendono su Amazon, Shopify (e in futuro altri marketplace/canali). Questo documento è l'architettura di riferimento. Le regole operative per Claude Code sono in `../CLAUDE.md`; la specifica funzionale della Release 1 è in `phases/PHASE_01_SALES_PROFIT.md`.

> **Nota 2026-07-30**: le sezioni 2 (Stack) e 11 (Struttura repository) di questo documento descrivevano scelte assunte prima di avere codice reale. Il 2026-07-30 è stato importato in questo repository un codebase già funzionante e in produzione, che ha sostituito quelle assunzioni con la realtà (Express invece di NestJS, nessun monorepo tool, auth custom invece di Auth.js). Le sezioni sottostanti sono state aggiornate di conseguenza. La sezione 5 (ERD) descrive ancora l'architettura dati **target**; lo schema **reale** oggi in `backend/prisma/schema.prisma` è più semplice (single-tenant, marketplace come stringa) ma usa già `Decimal` per gli importi monetari (migrato lo stesso 2026-07-30, database vuoto quindi senza backfill) — vedi §5bis e `docs/tech-debt.md` E.2.

## 1. Scope confermato

- **Marketplace al lancio**: Italia, Germania, Francia, Spagna (multi-marketplace fin da Release 1; UK valutato in seguito).
- **Seller account**: multi-account fin da Release 1 (non solo in previsione futura).
- **Valuta aziendale**: EUR. Ogni transazione non-EUR mantiene valuta originale, tasso di cambio applicato e controvalore EUR.

Nota tecnica SP-API: le credenziali (refresh token) sono rilasciate per *region* (NA/EU/FE), non per singolo marketplace. Un seller account con account Europa ottiene un solo set di credenziali valido per IT/DE/FR/ES/UK. Questo non elimina la necessità di modellare ogni marketplace come entità distinta (valuta, fuso orario, fee, lingua), ma significa che `amazon_credentials` è legato all'account+region, mentre `marketplaces` è una tabella di lookup indipendente collegata agli ordini.

## 2. Stack tecnico (reale, aggiornato al 2026-07-30)

| Area | Tecnologia | Note |
|---|---|---|
| Frontend | Next.js 14 + TypeScript | |
| UI | Tailwind CSS | (non shadcn/ui) |
| Grafici | Recharts | |
| Backend | Node.js + Express + TypeScript | non NestJS |
| Database | PostgreSQL | |
| ORM | Prisma | oggi senza storico migrazioni (`db push`) — da versionare, vedi `CLAUDE.md` |
| Cache e code | Nessuna (no Redis/BullMQ) | sync via job schedulato + polling, non via coda |
| File / immagini | Non ancora presente | da introdurre quando serve (prodotti, documenti) |
| Autenticazione | Custom: bcrypt + express-session + connect-pg-simple + MFA (otplib/qrcode) | non Auth.js |
| API Amazon | Selling Partner API (SP-API) | Orders, Ads, Settlement/Finances, Reports (inventory, forecast) — già implementato |
| API Shopify | Admin GraphQL API + webhook + polling 60s | canale non previsto nella Fase 0 originale, ma già integrato e in uso |
| Monorepo | Nessuno | `backend/` e `frontend/` sono due app indipendenti nello stesso repo Git |
| Hosting | AWS Lightsail | Docker Compose, deploy manuale via SCP |
| Database gestito | Nessuno (Postgres self-hosted su Lightsail) | |
| Monitoraggio errori | `AppErrorLog` (tabella propria), nessun Sentry | |
| Log | console/log applicativi | non ancora Pino strutturato |
| Test | Vitest + Testcontainers (Postgres reale) + MSW | no Playwright ancora |
| Repository | GitHub (privato, GitHub Free — niente branch protection automatica) | |
| CI/CD | GitHub Actions (`ci-backend`, `ci-frontend`, `pr-quality`) | |

Architettura: domini organizzati per cartella (`backend/src/amazon/`, `backend/src/auth/`, `backend/src/services/` per Shopify, `backend/src/repositories/` come unico accesso a Prisma) invece di moduli NestJS. La separazione delle responsabilità esiste comunque — vedi `CLAUDE.md § Architettura attuale`.

```
Frontend (Next.js)
    ↓
Backend API (Express)
    ↓
Domini applicativi (amazon/, shopify via services/, auth/, repositories/)
    ↓
PostgreSQL
```

I moduli previsti dalla visione originale (magazzino con ledger, fornitori, ordini d'acquisto, fatture/prima nota/scadenzario) non sono ancora stati costruiti: vanno aggiunti seguendo i pattern già in uso (repository layer, route Express, test Testcontainers), non introducendo un framework diverso a metà progetto.

## 3. Modello dati a tre livelli

**Livello 1 — Raw data**: copia fedele di ciò che arriva da Amazon (ordini, righe ordine, transazioni finanziarie, commissioni, costi FBA, rimborsi, resi, report inventario, report advertising, payload API originali). Mai modificato dopo l'inserimento.

**Livello 2 — Dati normalizzati**: formato interno del gestionale (vendita, prodotto, marketplace, unità vendute, ricavo, commissione, logistica, advertising, costo merce, imposte, rimborso).

**Livello 3 — Metriche aggregate**: quanto consuma la dashboard (fatturato giornaliero, profitto, margine %, TACOS, ACOS, ROAS, unità vendute, utile per ASIN, utile per marketplace, andamento vs periodo precedente).

Questa separazione permette di ricalcolare il profitto in futuro senza dover riscaricare i dati da Amazon.

## 4. Formula del profitto

```
  Ricavi prodotto
+ Ricavi spedizione
+ Altri accrediti
- IVA inclusa nel ricavo (scorporo)
- Rimborso cliente
- Commissione Amazon
- Fee FBA
- Costi di fulfillment
- Costi di stoccaggio attribuiti
- Costo pubblicitario attribuito
- Costo della merce
- Costo di trasporto della merce
- Dazi e costi di importazione
- Costi promozionali
- Altri costi variabili
= Profitto netto operativo
```

Tre stati del profitto, sempre distinti e mai confusi in UI:

- **Stimato**: disponibile rapidamente, con dati parziali (es. advertising non ancora arrivato).
- **Consolidato**: dopo l'arrivo delle transazioni finanziarie (Finances API).
- **Riconciliato**: verificato con settlement e fatture.

Il motore di calcolo va isolato dalla UI in un modulo dedicato (`backend/src/profit-engine/` o equivalente, coerente con l'architettura Express reale — non un package di monorepo, dato che non esiste un monorepo), versionato, testabile. Ogni calcolo salva: versione formula, data calcolo, input utilizzati, valuta originale, tasso di cambio, risultato in valuta marketplace e in EUR. Un ricalcolo (cambio costo merce o formula) crea una nuova versione, non sovrascrive quella precedente. **Questo motore non esiste ancora nel codebase importato**: oggi il P&L (`frontend/src/app/amazon/pl/page.tsx`) e i KPI derivano da query dirette sui repository, senza un livello di calcolo versionato — è uno dei gap principali da colmare per rispettare il principio non negoziabile "nessun dato economico sovrascritto senza storico".

## 5. ERD testuale — architettura dati TARGET (non ancora implementata così)

> Le entità sotto restano l'obiettivo architetturale (multi-tenant, multi-account, raw layer separato, Decimal). Per lo schema realmente in uso oggi vedi §5bis subito dopo.

### Identity & organizzazione
- `organizations` (id, name, baseCurrency, timezone, createdAt, updatedAt)
- `users` (id, organizationId→organizations, email, name, createdAt, updatedAt) — soft delete
- `roles` (id, organizationId→organizations, name)
- `user_roles` (userId→users, roleId→roles) — chiave composita

Vincolo trasversale: **ogni query è vincolata all'organizationId dell'utente autenticato.**

### Amazon integration
- `amazon_accounts` (id, organizationId→organizations, sellerId, region, name, status, createdAt) — un account per seller central account
- `amazon_credentials` (id, amazonAccountId→amazon_accounts, encryptedRefreshToken, encryptionKeyVersion, expiresAt, rotatedAt) — mai token in chiaro
- `marketplaces` (id, code [IT/DE/FR/ES/UK...], currency, timezone, locale) — tabella di lookup, non legata a un singolo account
- `amazon_account_marketplaces` (amazonAccountId→amazon_accounts, marketplaceId→marketplaces) — quali marketplace un account vende attivamente

### Sincronizzazione
- `sync_jobs` (id, amazonAccountId→amazon_accounts, marketplaceId→marketplaces nullable, type [orders/finances/reports/advertising], status [queued/running/completed/completed_with_warnings/failed/cancelled], startedAt, finishedAt, attempts, lastError, statsJson)
- `sync_cursors` (id, amazonAccountId→amazon_accounts, marketplaceId→marketplaces, type, cursorValue, updatedAt) — un cursore per account+marketplace+tipo, per sync incrementale
- `raw_api_events` (id, syncJobId→sync_jobs, payloadJson, receivedAt) — payload originale mai modificato
- `raw_reports` (id, syncJobId→sync_jobs, reportType, payloadRef, receivedAt)
- `raw_financial_events` (id, syncJobId→sync_jobs, payloadJson, receivedAt)

### Vendite (normalizzato)
- `orders` (id, amazonAccountId→amazon_accounts, marketplaceId→marketplaces, amazonOrderId **unique per account**, purchaseDate, status, currency, createdAt, updatedAt)
- `order_items` (id, orderId→orders, sku, asin, quantity, itemPrice, itemTax, shippingPrice, promotionDiscount)
- `order_status_history` (id, orderId→orders, status, changedAt) — append-only

Vincolo univoco critico: `(amazonAccountId, amazonOrderId)` — impedisce duplicazione ordini in caso di retry/re-sync.

### Finanziario
- `financial_transactions` (id, amazonAccountId→amazon_accounts, orderId→orders nullable, type, amount [Decimal], currency, postedDate, financialEventGroupId **unique**)
- `fees` (id, financialTransactionId→financial_transactions, feeType, amount [Decimal])
- `refunds` (id, orderId→orders, amount [Decimal], reason, refundDate)
- `reimbursements` (id, amazonAccountId→amazon_accounts, amount [Decimal], reason, date)
- `advertising_costs` (id, amazonAccountId→amazon_accounts, marketplaceId→marketplaces, campaignId, date, spend [Decimal], sku nullable, asin nullable)

### Prodotti e costi
- `products` (id, organizationId→organizations, name, brand, status) — soft delete
- `product_marketplace_identifiers` (id, productId→products, marketplaceId→marketplaces, sku, asin, ean) — vincolo unique `(marketplaceId, asin)`
- `product_cost_history` (id, productId→products, costType [standard/weighted_average/lot], amount [Decimal], currency, validFrom, validTo nullable, source, note, authorId→users) — mai update in place, sempre nuova riga con nuovo `validFrom`

### Profit engine
- `profit_calculations` (id, orderId→orders nullable, productId→products nullable, periodStart, periodEnd, state [estimated/consolidated/reconciled], formulaVersion, inputsJson, exchangeRate, resultMarketplaceCurrency [Decimal], resultBaseCurrency [Decimal], calculatedAt) — append-only, mai overwrite
- `daily_metrics` (id, organizationId→organizations, amazonAccountId→amazon_accounts nullable, marketplaceId→marketplaces nullable, date, revenue, profit, marginPct, unitsSold, acos, tacos, roas, completenessState) — tabella derivata, ricostruibile

### Audit
- `audit_log` (id, organizationId→organizations, userId→users nullable, entityType, entityId, action, diffJson, createdAt) — append-only, su tutte le entità economiche/sensibili

### Indici critici da subito
- `orders (amazonAccountId, amazonOrderId)` unique
- `financial_transactions (financialEventGroupId)` unique
- `product_marketplace_identifiers (marketplaceId, asin)` unique
- `sync_cursors (amazonAccountId, marketplaceId, type)` unique
- Indici su `(organizationId, date)` per tutte le tabelle di metriche/dashboard

### Dati sensibili → cifratura + audit
`amazon_credentials.encryptedRefreshToken`, dati anagrafici in `users`.

### Concorrenza da presidiare
- Scritture concorrenti su `sync_cursors` durante retry paralleli → lock ottimistico o `SELECT ... FOR UPDATE`.
- Ricalcolo `daily_metrics` mentre arrivano nuove `financial_transactions` in ritardo → il job di ricalcolo deve essere idempotente e rieseguibile su un intervallo, non solo sull'ultimo giorno.

## 5bis. Schema reale (importato 2026-07-30) — `backend/prisma/schema.prisma`

24 modelli, single-tenant (nessun `Organization`/multi-account), Amazon + Shopify nello stesso schema:

- **Shopify**: `ShopifyOrder`, `OrderLineItem`, `MarketplaceRule` (placeholder, non usato a runtime — vedi `docs/tech-debt.md` C.2), `SyncState`, `WebhookEventLog`, `AppErrorLog`, `ProductDailySnapshot`.
- **Amazon**: `AmazonSyncJob`, `AmazonOrder`, `AmazonOrderItem`, `AmazonProductSnapshot`, `AmazonSettlement`, `AmazonSettlementTransaction`, `AmazonProductCogs`, `AmazonCogsPriceEntry`, `AmazonInventory`, `AmazonAdSnapshot`, `AmazonAdKeywordSnapshot`, `AmazonAdSearchTerm`, `AmazonAdKeyword`, `AmazonForecastCalibration`, `AmazonForecastSnapshot`.
- **Identity/audit**: `User`, `MfaDevice`, `AuditLog`.

Differenze principali rispetto al target §5:
- `marketplace` è una **stringa** (`IT`/`DE`/`FR`/`ES`/`ALL_EU`) su ogni record, non un'entità con valuta/fuso/lingua propri.
- Nessun `amazon_accounts`/`amazon_credentials`: le credenziali SP-API sono in variabili d'ambiente (`AMAZON_EU_REFRESH_TOKEN`, ecc. — vedi `.env.example`), un solo account gestibile.
- Importi monetari in `Decimal` (migrato 2026-07-30, vedi `docs/tech-debt.md` E.2) — ratios/percentuali (ACOS, ROAS, CTR, coefficienti EWMA) restano `Float` di proposito.
- Nessuna tabella di payload raw: `AmazonOrder` e `ShopifyOrder` sono già "normalizzati" al momento della sync, il payload originale Amazon/Shopify non viene conservato.
- `AmazonSyncJob` copre già bene il concetto di job (tipo, stato, date, contatori record, errore) — buona base per evolvere verso `sync_jobs`/`sync_cursors` del target.
- `AmazonSettlement`/`AmazonSettlementTransaction` implementano già la distinzione fatturato-vs-incassato (vedi `docs/tech-debt.md` A.8 per il gap di riconciliazione automatica).

## 6. Strategia SP-API e sincronizzazione

**Realtà implementata** (non basata su coda BullMQ, ma su `setInterval` in-process nel backend Express — `backend/src/amazon/sync.job.ts`):

| Dato | Cadenza reale |
|---|---|
| Ordini (incremental sync) | ogni 5 minuti — **supera** il requisito Fase 1 di 30 minuti |
| Snapshot prodotto giornaliero | 01:00 + refresh orario per il giorno corrente |
| Settlement | ogni 4 ore |
| Forecast snapshot | ogni 6 ore |
| Ads: cache campagne live | ogni 2 minuti |
| Ads: metriche campagna e per-ASIN del giorno corrente | ogni 10 minuti, senza sovrapposizione; allow-list marketplace opzionale |
| Ads: consolidamento metriche del giorno precedente | ogni 24 ore |
| Ads: keyword metrics | ogni 3 ore |
| Ads: search term | ogni notte alle 02:00 |
| Shopify (ordini) | webhook in tempo reale + polling ogni 60s |

Limiti noti di questo approccio (da affrontare quando si introduce eventualmente una coda come BullMQ, non urgente oggi): i job vivono nel processo Express stesso (`setInterval`), quindi un riavvio del backend interrompe temporaneamente tutte le sync fino al prossimo avvio; non c'è retry con backoff strutturato né dead letter queue; non c'è distinzione esplicita tra errore temporaneo e permanente a livello di infrastruttura (solo `errorMessage` su `AmazonSyncJob`).

**Target originale (non ancora implementato)**: un account Amazon (`amazon_accounts`) per region con N `marketplaces`, credenziali cifrate con rotazione (`amazon_credentials`), coda BullMQ con `sync_jobs`/`sync_cursors` per idempotenza esplicita e cache Redis invalidata sui KPI. Vedi `CLAUDE.md § Roadmap di adeguamento`.

## 7. Ambienti

| Ambiente | Database | Note |
|---|---|---|
| Development | Postgres locale (Docker Compose incluso, `docker-compose.yml`) | |
| Production | Postgres self-hosted su AWS Lightsail | `docker-compose.prod.yml`, deploy manuale via SCP (il server non ha git installato) |

Non esiste ancora un ambiente di staging separato, né un database gestito (Neon/RDS/Supabase): tutto gira su un'unica istanza Lightsail. Nessuna migrazione va eseguita manualmente in produzione senza conferma esplicita, anche in assenza di una pipeline CI/CD che lo impedisca automaticamente.

## 8. Migrazioni

- Ogni modifica schema: migrazione forward + strategia di rollback documentata + verifica dati + impatto query/API + test.
- Modifiche distruttive seguono il processo: nuova struttura → doppia scrittura temporanea → backfill → verifica → migrazione letture → periodo di deprecazione → rimozione autorizzata.
- Nessuna migrazione già applicata va modificata; nessuna colonna eliminata senza fase di deprecazione.

## 9. Test e CI/CD (reale)

- Vitest + `@testcontainers/postgresql` (Postgres reale, non mockato) per repository, integration test su sync Shopify/Amazon, stats. MSW per mockare le API esterne (Shopify GraphQL, SP-API, Ads API).
- Fixture esistenti in `backend/tests/fixtures/`: `amazon-orders`, `amazon-settlements`, `shopify-orders`, `users`. Non copre ancora tutti i casi limite economici elencati nella visione originale (fee tardiva, cambio valuta, commissione negativa, ecc.) — da estendere quando si costruisce il profit engine versionato.
- Pipeline GitHub Actions reali: `ci-backend.yml` (path `backend/**`), `ci-frontend.yml` (path `frontend/**`), `pr-quality.yml`. Obbligatorie verdi prima del merge su `develop`/`main`, per convenzione (non enforced da GitHub Free — vedi `docs/branch-protection.md`).

## 10. Osservabilità e sicurezza (reale)

- Log: `console.log`/`console.error` con prefissi (`[Sync]`, `[Amazon Sync]`), non ancora JSON strutturato né Pino. Nessun correlation ID cross-servizio.
- Errori applicativi in tabella `AppErrorLog`; job Amazon tracciano stato/errore su `AmazonSyncJob`. Nessun Sentry, nessuna dead letter queue, nessun retry con backoff strutturato (i job si riprovano al giro di `setInterval` successivo).
- Sicurezza già presente: bcrypt per password, sessioni server-side (`connect-pg-simple`), MFA (TOTP via `otplib`/`qrcode`), rate limiting (`express-rate-limit`), `AuditLog` su azioni admin/auth, validazione input con `zod`.
- Gap: nessuna segregazione multi-organizzazione (single-tenant), nessuna cifratura esplicita delle credenziali SP-API a riposo (vivono in variabili d'ambiente, non in DB).

## 11. Struttura repository (reale)

```
WBDASH/
├── backend/
│   ├── prisma/schema.prisma        # nessuna cartella migrations/ ancora
│   └── src/
│       ├── amazon/                  # SP-API: routes/, forecast/, services, repo-adjacent logic
│       ├── auth/
│       ├── chat/
│       ├── config/                  # marketplace-rules.ts (Shopify)
│       ├── jobs/                    # sync Shopify
│       ├── middleware/
│       ├── repositories/            # amazon/, shopify/ — unico accesso a Prisma
│       ├── routes/                  # stats, analytics, products, chat
│       ├── services/                 # shopify.service, order.service, product.service
│       ├── sse/
│       ├── types/
│       └── webhooks/
│   └── tests/                       # fixtures/, helpers/, integration/, repositories/
├── frontend/
│   └── src/
│       ├── app/                     # pagine (dashboard, amazon/**, admin, login, account)
│       ├── components/               # dashboard/, amazon/, amazon/payments/, auth/, products/, layout/
│       ├── context/, hooks/, lib/
│       └── test/
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── phases/
│   ├── tech-debt.md
│   ├── cd-evolution.md
│   └── branch-protection.md
├── nginx/, scripts/, .github/workflows/
├── docker-compose.yml, docker-compose.prod.yml, nginx.conf
├── CLAUDE.md, AGENTS.md, CONTRIBUTING.md, GIT_WORKFLOW.md, DEPLOY_CHECKLIST.md, README.md
└── amazon-auth.js                   # helper OAuth SP-API standalone
```

Non esiste (e non va introdotta senza motivo esplicito) una struttura `apps/`/`packages/`/monorepo tool: `backend/` e `frontend/` restano due app Node indipendenti nello stesso repository, coerentemente con come il codice è stato scritto, testato e deployato finora.
