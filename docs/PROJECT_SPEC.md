# WBDASH — Project Spec

Piattaforma gestionale e di business intelligence per aziende che vendono su Amazon (e in futuro su altri marketplace/canali). Questo documento è l'architettura di riferimento per la Fase 0 (fondamenta). Le regole operative per Claude Code sono in `../CLAUDE.md`; la specifica funzionale della Release 1 è in `phases/PHASE_01_SALES_PROFIT.md`.

## 1. Scope confermato

- **Marketplace al lancio**: Italia, Germania, Francia, Spagna (multi-marketplace fin da Release 1; UK valutato in seguito).
- **Seller account**: multi-account fin da Release 1 (non solo in previsione futura).
- **Valuta aziendale**: EUR. Ogni transazione non-EUR mantiene valuta originale, tasso di cambio applicato e controvalore EUR.

Nota tecnica SP-API: le credenziali (refresh token) sono rilasciate per *region* (NA/EU/FE), non per singolo marketplace. Un seller account con account Europa ottiene un solo set di credenziali valido per IT/DE/FR/ES/UK. Questo non elimina la necessità di modellare ogni marketplace come entità distinta (valuta, fuso orario, fee, lingua), ma significa che `amazon_credentials` è legato all'account+region, mentre `marketplaces` è una tabella di lookup indipendente collegata agli ordini.

## 2. Stack tecnico

| Area | Tecnologia | Note |
|---|---|---|
| Frontend | Next.js + TypeScript | |
| UI | Tailwind CSS + shadcn/ui | |
| Grafici | Recharts | |
| Backend | NestJS + TypeScript | |
| Worker | Processo NestJS separato | job schedulati, sync, ricalcoli |
| Database | PostgreSQL | |
| ORM | Prisma | migrazioni versionate, mai `db push` in prod |
| Cache e code | Redis + BullMQ | |
| File / immagini | Object storage S3-compatible | default: Cloudflare R2 |
| Autenticazione | Auth.js | default assunto, vedi `CLAUDE.md` |
| API Amazon | Selling Partner API (SP-API) | Orders, Finances, Reports |
| Monorepo | pnpm workspaces + Turborepo | default assunto |
| Hosting iniziale | Render | default assunto |
| Database gestito | Neon | default assunto (staging + prod) |
| Monitoraggio errori | Sentry | |
| Log | Pino, log strutturato JSON | |
| Test | Vitest/Jest + Playwright | |
| Repository | GitHub | |
| CI/CD | GitHub Actions | |

Architettura: **monolite modulare**. Niente microservizi in questa fase, salvo necessità tecnica dimostrabile.

```
Frontend (Next.js)
    ↓
Backend API (NestJS)
    ↓
Moduli applicativi (vedi CLAUDE.md § Architettura modulare)
    ↓
PostgreSQL + Redis + Object Storage
```

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

Il motore di calcolo (`packages/profit-engine`) è isolato dalla UI, versionato, testabile. Ogni calcolo salva: versione formula, data calcolo, input utilizzati, valuta originale, tasso di cambio, risultato in valuta marketplace e in EUR. Un ricalcolo (cambio costo merce o formula) crea una nuova versione, non sovrascrive quella precedente.

## 5. ERD testuale (entità principali — Fase 0/1)

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

## 6. Strategia SP-API e sincronizzazione

- Un account Amazon (`amazon_accounts`) appartiene a una region (EU in questo caso) e vende su N `marketplaces`.
- Le credenziali sono cifrate a riposo, con rotazione e scadenza gestite in `amazon_credentials`.
- Ogni sync usa **Orders API** (ordini nuovi/modificati), **Finances API** (transazioni finanziarie, non serve attendere la chiusura periodo), **Reports API** (inventario, advertising, riconciliazione).

Job schedulato ogni 30 minuti:

1. Individua account attivi.
2. Crea `sync_jobs` per ogni combinazione account × marketplace × tipo dato.
3. Recupera ordini nuovi/modificati (incrementale via `sync_cursors`).
4. Normalizza gli ordini (Livello 1 → Livello 2).
5. Recupera transazioni finanziarie disponibili.
6. Aggiorna advertising quando disponibile.
7. Ricalcola le `daily_metrics` per gli intervalli coinvolti (non solo l'ultimo giorno: i dati finanziari arrivano in ritardo).
8. Invalida la cache Redis dei KPI coinvolti.
9. Registra statistiche ed errori sul job.

Requisiti di sync: incrementale, idempotente, recuperabile, osservabile, resiliente ai retry, rispettosa dei rate limit, gestisce paginazione, dati in ritardo, ricalcolo di intervalli passati, nessun duplicato. Stati job: `queued`, `running`, `completed`, `completed_with_warnings`, `failed`, `cancelled`.

## 7. Ambienti

| Ambiente | Database | Note |
|---|---|---|
| Development | Postgres locale via Docker Compose | Redis e MinIO (stand-in R2) anch'essi in Docker Compose |
| Staging | Neon (branch dedicato) | dati di test / sandbox SP-API |
| Production | Neon | backup automatici, migrazioni solo via pipeline |

Nessuna migrazione va eseguita manualmente in produzione: solo tramite pipeline CI/CD dopo approvazione.

## 8. Migrazioni

- Ogni modifica schema: migrazione forward + strategia di rollback documentata + verifica dati + impatto query/API + test.
- Modifiche distruttive seguono il processo: nuova struttura → doppia scrittura temporanea → backfill → verifica → migrazione letture → periodo di deprecazione → rimozione autorizzata.
- Nessuna migrazione già applicata va modificata; nessuna colonna eliminata senza fase di deprecazione.

## 9. Test e CI/CD

- Unit test, integration test, test su database reale (non mockato per i path economici), test di idempotenza, test gestione errori, test autorizzazioni, test casi limite.
- Fixture obbligatorie per il profit engine: vendita standard, vendita con sconto, ordine multi-prodotto, rimborso totale, rimborso parziale, fee tardiva, costo advertising tardivo, costo prodotto mancante, cambio valuta, reso, rimborso senza reso, commissione negativa, accredito Amazon, ordine cancellato.
- Pipeline GitHub Actions: lint → typecheck → test → build, obbligatoria prima del merge su `develop`/`main`.

## 10. Osservabilità e sicurezza

- Log JSON strutturati (Pino) con correlation ID, request ID, job ID, account ID, marketplace ID. Mai token, dati personali o payload sensibili nei log.
- Metriche sui job, alert su errori, dead letter queue, retry con backoff, distinzione errore temporaneo/permanente.
- RBAC, segregazione dati per organizzazione, cifratura segreti, validazione input, rate limiting, audit log, backup con restore testato, principio del minimo privilegio.

## 11. Struttura repository

```
WBDASH/
├── apps/
│   ├── web/            # Next.js
│   ├── api/             # NestJS
│   └── worker/          # NestJS worker (job schedulati)
├── packages/
│   ├── database/        # Prisma client condiviso
│   ├── ui/
│   ├── shared/
│   ├── config/
│   ├── amazon-sp-api/   # client SP-API isolato
│   ├── profit-engine/   # motore di calcolo isolato e versionato
│   └── testing/
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── phases/
│   ├── decisions/       # ADR, creata al bisogno
│   ├── architecture/    # creata al bisogno
│   ├── database/        # creata al bisogno
│   └── modules/         # creata al bisogno
├── infrastructure/
│   ├── docker/
│   ├── scripts/
│   └── github/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
└── package.json
```

Nota: in questa fase (Fase 0 — documentazione) le cartelle `apps/`, `packages/`, `prisma/` **non vengono ancora create**. Verranno scaffoldate come primo task implementativo di Fase 0, una volta approvato questo documento.
