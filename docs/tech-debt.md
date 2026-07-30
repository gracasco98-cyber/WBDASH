# Tech Debt — My Dashboard

Tracker del **tech debt residuo** non affrontato dalla revisione sistematica 2026-05-07. Aggiornato ad ogni PR della revisione che identifica un debito non risolto in scope.

> **Riferimento:** spec [`docs/superpowers/specs/2026-05-07-revision-design.md`](./superpowers/specs/2026-05-07-revision-design.md) Sezione 6 — i file 600–800 LOC restanti vengono qui tracciati. Roadmap [`docs/superpowers/plans/2026-05-07-revision-roadmap.md`](./superpowers/plans/2026-05-07-revision-roadmap.md) per stato delle PR.

---

## Convenzione

Ogni voce ha:
- **File / area**: percorso o dominio
- **Problema**: descrizione sintetica
- **Impatto**: chi/cosa ne soffre
- **Effort stimato**: T-shirt size (S/M/L/XL)
- **Origine**: PR/issue che ha identificato il debito

---

## A. Bug e quirk di calcolo (lock-in nei test)

Questi sono comportamenti del codice corrente che i test hanno **lockato in** (per evitare regressioni durante il refactor) ma che **potrebbero essere bug**. Da decidere caso per caso se fixare o accettare.

### A.1 — Cancelled orders inclusi nei KPI Shopify, esclusi negli Amazon

- **File**: `backend/src/routes/stats.routes.ts:103` (Shopify) vs `backend/src/amazon/routes.ts:360` (Amazon)
- **Problema**: lo stesso concetto di "ordine cancellato" viene trattato in modo opposto tra i due domini. Shopify: `WHERE "isTest" = false` (non filtra `isCancelled`). Amazon: filtra esplicitamente `Canceled`/`Cancelled`.
- **Impatto**: divergenza dei numeri tra dashboard Shopify e Amazon — i KPI cross-channel possono essere confusi
- **Effort**: M (richiede decisione di prodotto + allineamento test)
- **Origine**: PR 6 (test/kpi-shopify) + PR 7 (test/kpi-amazon)

### A.2 — `last7` cutoff non allineato a midnight Italy

- **File**: `backend/src/routes/stats.routes.ts:54` (Shopify), `backend/src/amazon/routes.ts:161` (Amazon)
- **Problema**: Shopify usa `new Date(Date.now() - 7 * 86400000)` (raw ms). Amazon usa una funzione che sottrae `italyOffsetMs()`. Risultato: i due endpoint hanno cutoff diversi per "last 7 giorni" (es. Shopify cutoff 10:00Z, Amazon 08:00Z)
- **Impatto**: dati apparentemente incongruenti tra dashboard se osservati a cavallo del cutoff
- **Effort**: S (allineare a una funzione condivisa `italyDayStart()`)
- **Origine**: PR 6, PR 7

### A.3 — AOV Shopify usa `totalRevenue` (gross), non `netRevenue`

- **File**: `backend/src/routes/stats.routes.ts:143`
- **Problema**: AOV (Average Order Value) calcolato come `totalRevenue / orderCount`. Dovrebbe usare `netRevenue` (post-rimborsi) per essere semanticamente corretto?
- **Impatto**: AOV gonfiato quando ci sono molti rimborsi
- **Effort**: S (cambiare il numeratore)
- **Origine**: PR 6

### A.4 — Revenue Amazon da `SUM(itemPrice)` invece di `AmazonOrder.itemTotal`

- **File**: `backend/src/amazon/routes.ts:355`
- **Problema**: la revenue è calcolata via JOIN con `AmazonOrderItem.itemPrice` invece di leggere `AmazonOrder.itemTotal` (campo già aggregato sulla tabella ordini)
- **Impatto**: query più costosa + possibile divergenza se `itemTotal` non viene mantenuto sincronizzato con i line items
- **Effort**: M (verificare se `itemTotal` è affidabile, poi switchare)
- **Origine**: PR 7

### A.5 — `salesChannel='Non-Amazon'` esclusi senza Shopify-equivalent

- **File**: `backend/src/amazon/routes.ts:361`
- **Problema**: gli ordini con `salesChannel='Non-Amazon'` (es. ordini multi-canale che Amazon traccia ma non sono fulfillment Amazon) sono esclusi dai KPI Amazon. Shopify non ha un filtro equivalente
- **Impatto**: discrepanza concettuale; non è chiaro se sia voluto
- **Effort**: S (decidere comportamento + documentare in `marketplace-rules.ts`)
- **Origine**: PR 7

### A.6 — `isBusinessOrder` non influenza il filtraggio KPI

- **File**: `backend/src/amazon/routes.ts:350-364`
- **Problema**: il flag `isBusinessOrder` è memorizzato sul record `AmazonOrder` ma non c'è alcun filtro/breakdown nei KPI
- **Impatto**: impossibile distinguere B2B vs B2C nelle dashboard correnti
- **Effort**: M (aggiungere breakdown opzionale)
- **Origine**: PR 7

### A.7 — `Unshipped` orders inclusi nei KPI Amazon

- **File**: `backend/src/amazon/routes.ts:360`
- **Problema**: la WHERE clause esclude solo `Canceled`/`Cancelled`. Ordini in stato `Unshipped` (= ricevuti ma non spediti) vengono contati in revenue/order count come se fossero completati
- **Impatto**: revenue gonfiata quando ci sono backlog di spedizione
- **Effort**: S (aggiungere filter su orderStatus)
- **Origine**: PR 7

### A.8 — `AmazonSettlement.totalAmount` ≠ sum delle transactions

- **File**: `backend/src/amazon/routes.ts:451-501`, repo `settlement.repo.ts`
- **Problema**: il campo `totalAmount` sulla tabella `AmazonSettlement` rappresenta il **bonifico bancario reale** ricevuto, ma la somma delle `AmazonSettlementTransaction` può non quadrare (Amazon talvolta deposita importi diversi). Esempio nei test: bank=450, sum_txn=340, delta=110
- **Impatto**: reconciliation tra ricavi attesi e flusso bancario non automatizzata; richiede ispezione manuale dei delta
- **Effort**: L (servirebbe un widget riconciliazione + spiegazione del delta)
- **Origine**: PR 7, PR 9

### A.9 — `roas = 0` invece di `null` quando spend>0 e sales=0

- **File**: `backend/src/amazon/ads-sync.service.ts` (`saveSnapshots`)
- **Problema**: il calcolo `roas = sales / spend` ritorna `0` quando `spend > 0` e `sales = 0` (campagne sprecate). Semanticamente `null` o "infinito ACOS" sarebbe più corretto
- **Impatto**: medie ROAS aggregate inquinate da zeri
- **Effort**: S (gestire null nel client + UI)
- **Origine**: PR 9

### A.10 — `lineItemsCount` non live (snapshot a upsert)

- **File**: `backend/src/services/order.service.ts` (`upsertOrder`)
- **Problema**: il campo `lineItemsCount` su `ShopifyOrder` è impostato dal valore `raw.lineItems.edges.length` al momento dell'upsert. Se i line items in DB cambiano successivamente, il counter NON viene aggiornato (drift)
- **Impatto**: counter potenzialmente sbagliato nel medio periodo
- **Effort**: M (rimuovere il campo + computare al volo, oppure trigger-update su mod line items)
- **Origine**: PR 8

### A.11 — `syncedAt` aggiornato solo nel path di update

- **File**: `backend/src/services/order.service.ts` (`upsertOrder`)
- **Problema**: `syncedAt` viene esplicitamente refreshato solo nel ramo `update`. Nel `create` ramo, viene usato il default Prisma `@default(now())`. Se la sync re-importa ordini che esistono già, `syncedAt` è coerente; se importa ordini nuovi, è il momento del first-create
- **Impatto**: minore — è ambiguo se `syncedAt` significhi "data ultimo arrivo dato Shopify" o "data ultimo update locale"
- **Effort**: S (decidere semantica + uniformare)
- **Origine**: PR 8

### A.12 — Ordini con `raw.test === true` silenziosamente skippati

- **File**: `backend/src/services/order.service.ts` (`upsertOrder`)
- **Problema**: se Shopify marca un ordine come test, `upsertOrder` ritorna `null` senza alcun log/metric. Nessun modo di sapere quanti ordini test sono stati skippati
- **Impatto**: silent failure (vedi convenzione anti-silent-failure in CONTRIBUTING.md). Va almeno loggato
- **Effort**: S (aggiungere log + metric counter)
- **Origine**: PR 8

### A.13 — `isRefunded` confronta string non-numerico

- **File**: `backend/src/services/order.service.ts` (`upsertOrder`)
- **Problema**: `isRefunded = refundedAmount > 0`, ma se Shopify invia `totalRefundedSet: { shopMoney: { amount: "0.00" }}` la string `"0.00"` viene parsata correttamente come `0` → `isRefunded=false`. Tuttavia se in futuro arrivasse `"0"` (senza decimali) il confronto comunque tiene. Solido ma fragile
- **Impatto**: nessuno oggi, potenziale regressione se Shopify cambia formato
- **Effort**: S (parse esplicito)
- **Origine**: PR 8

### A.14 — `parseTsv` richiede header + ≥1 data line

- **File**: `backend/src/amazon/sp-api.service.ts` (`parseTsv`)
- **Problema**: input vuoto o solo-header ritorna `[]` silenziosamente. Settlement reports vuoti (raro ma possibile) non producono errori espliciti
- **Impatto**: minore, ma rende il debugging più difficile
- **Effort**: S (logging)
- **Origine**: PR 9

### A.15 — `bootstrapSource` hardcoded

- **File**: `backend/src/amazon/forecast-calibration.service.ts` (`bootstrapCalibration`)
- **Problema**: il campo `bootstrapSource` è sempre impostato a `"db_settlements"`. C'è un altro path (excel_import) ma non è mai utilizzato in pratica
- **Impatto**: dead code se il path excel_import non torna mai. Da rimuovere o usare
- **Effort**: S (decidere)
- **Origine**: PR 9

---

## B. File-size debt (sopra i limiti soft)

I file sotto sono **sopra i limiti documentati** in CONTRIBUTING.md ma **non in scope** della revisione 2026-05-07 (top 5 god-file → PR 14–18; il resto resta come tech debt).

### B.1 — `backend/src/routes/products.routes.ts` (726 LOC)

- **Limite**: route file ≤400 LOC
- **Effort**: M (split per endpoint group)
- **Origine**: spec 2026-05-07 sezione 6

### B.2 — `backend/src/routes/stats.routes.ts` (702 LOC)

- **Limite**: route file ≤400 LOC
- **Effort**: M
- **Origine**: spec 2026-05-07 sezione 6

### B.3 — `backend/src/auth/auth.routes.ts` (680 LOC)

- **Limite**: route file ≤400 LOC
- **Note**: include MFA, reset password, audit log — può crescere ulteriormente
- **Effort**: M (split: auth core / MFA / password / audit)
- **Origine**: spec 2026-05-07 sezione 6

### B.4 — `backend/src/routes/analytics.routes.ts` (472 LOC)

- **Limite**: route file ≤400 LOC
- **Effort**: S (sopra di poco)
- **Origine**: spec 2026-05-07 sezione 6

### B.5 — `frontend/src/app/amazon/ppc/page.tsx` (1227 LOC)

- **Limite**: page Next.js ≤300 LOC
- **Effort**: L (decomposizione in componenti + hook)
- **Origine**: spec 2026-05-07 sezione 6 (top 5 ma non incluso nei 5 splittati)

### B.6 — `frontend/src/app/amazon/page.tsx` (1027 LOC)

- **Limite**: page Next.js ≤300 LOC
- **Effort**: L
- **Origine**: spec 2026-05-07 sezione 6

### B.7 — `frontend/src/components/dashboard/ShopifyBIOverview.tsx` (821 LOC)

- **Limite**: componente React ≤300 LOC
- **Effort**: M
- **Origine**: spec 2026-05-07 sezione 6

### B.8 — `frontend/src/app/account/security/page.tsx` (786 LOC)

- **Limite**: page Next.js ≤300 LOC
- **Effort**: M (gestione MFA e password — può estrarre componenti)
- **Origine**: scoperto durante audit pre-revisione

### B.9 — `frontend/src/app/amazon/cogs/page.tsx` (736 LOC)

- **Limite**: page Next.js ≤300 LOC
- **Effort**: M
- **Origine**: scoperto durante audit pre-revisione

### B.10 — `frontend/src/app/amazon/inventory/page.tsx` (725 LOC)

- **Limite**: page Next.js ≤300 LOC
- **Effort**: M
- **Origine**: scoperto durante audit pre-revisione

### B.11 — `frontend/src/components/dashboard/SellerboardKpiCards.tsx` (696 LOC)

- **Limite**: componente React ≤300 LOC
- **Effort**: M
- **Origine**: scoperto durante audit pre-revisione

### B.12 — `frontend/src/components/dashboard/SalesTabs.tsx` (682 LOC)

- **Limite**: componente React ≤300 LOC
- **Effort**: M
- **Origine**: scoperto durante audit pre-revisione

---

## C. Architettura / type-safety

### C.1 — Prisma 5.x `groupBy` con `_count: true` richiede cast `as any`

- **File**: `backend/src/repositories/shopify/line-items.repo.ts` (es. `groupForSnapshot`), `backend/src/repositories/amazon/orders.repo.ts` (es. `aggregateRevenueByMarketplace`)
- **Problema**: la firma overloaded di `prisma.X.groupBy({ _count: true, ... })` causa errori TS in Prisma 5.x quando si usa la shorthand boolean. Workaround: `(prisma.X.groupBy as any)({...})`. Issue noto upstream
- **Impatto**: perdita di type-safety in alcune query specifiche
- **Effort**: S (upgrade Prisma a versione futura che fixa, oppure migrare a `_count: { _all: true }` che mantiene typing)
- **Origine**: PR 12

### C.2 — `marketplace-rules.repo.ts` placeholder

- **File**: `backend/src/repositories/shopify/marketplace-rules.repo.ts`
- **Problema**: il file esiste come placeholder ma il modello `MarketplaceRule` di Prisma non ha **alcun callsite** nel codice. La detection runtime usa il TS config in `backend/src/config/marketplace-rules.ts`
- **Impatto**: dead schema (potenzialmente — verificare se `MarketplaceRule` Prisma model è mai usato altrove, es. seed script)
- **Effort**: S (eliminare schema o usarlo per overrides DB-driven delle rules)
- **Origine**: PR 12

### C.3 — Connection pool sharing tra test files

- **Problema**: dopo PR 11 (Prisma singleton), i test usano `setupTestDb()` con testcontainer dedicato. Il singleton in produzione è isolato. Nessun problema attuale ma da monitorare se Vitest viene configurato senza `pool: 'forks'` con `singleFork: true`
- **Effort**: S (documentare invariante)
- **Origine**: PR 11 self-review

### C.4 — `forecast.routes.ts` 574 LOC (sopra il limite ≤400)

- **File**: `backend/src/amazon/routes/forecast.routes.ts`
- **Problema**: contiene un singolo endpoint `/payments/forecast` con 7 query SQL parallele e logica EWMA complessa. Dopo lo split di PR 14, il file è 74 LOC sopra il limite route file (≤400 LOC nominale, accettato fino a 500)
- **Impatto**: la handler è grossa ma cohesiva — splittarla richiederebbe estrazione di helper SQL, che viola il vincolo "verbatim" del refactor PR 14. Da fare in una PR dedicata se si tocca quella logica
- **Effort**: M (estrazione di 2-3 helper function in un service o utils file)
- **Origine**: PR 14 self-review

### C.5 — `paymentUtils.ts` 768 LOC

- **File**: `frontend/src/components/amazon/payments/paymentUtils.ts`
- **Problema**: utility module estratto in PR 15. Pure functions (no React), tecnicamente non rientra nel limite "componente ≤300 LOC" o "service ≤500 LOC". Tuttavia è oggettivamente grande
- **Impatto**: minore — è organizzato per area (date utils, format utils, calculation utils, intelligence/copy utils) e ben tipato. Sub-split possibile in 3-4 file tematici
- **Effort**: S (split per area)
- **Origine**: PR 15 self-review

### C.6 — `lib/api/types.ts` 638 LOC

- **File**: `frontend/src/lib/api/types.ts`
- **Problema**: tutti i tipi delle response API in un solo file. Dopo lo split di `lib/api.ts` (PR 17) i tipi sono stati spostati qui in blocco
- **Impatto**: minore — è un file di sole type definitions. Sub-split per dominio (shopify, amazon, auth) sarebbe più cohesivo
- **Effort**: S (split per dominio)
- **Origine**: PR 17 self-review

### C.7 — Dipendenza circolare snapshot ↔ calibration-update

- **File**: `backend/src/amazon/forecast/forecast-snapshot.service.ts` ↔ `calibration-update.service.ts`
- **Problema**: dopo lo split di PR 18, snapshot chiama `getCalibration` da calibration-update, e `runDailyCalibration` chiama snapshot functions. Risolto con lazy `await import()` ma è un *code smell*
- **Impatto**: minore — Node module system la gestisce. Tuttavia rende il graph dei moduli meno chiaro
- **Effort**: M (estrarre l'overlap in un terzo modulo `forecast-orchestrator.ts` o accettare la circolarità documentata)
- **Origine**: PR 18 self-review

### C.8 — `marketplace-rules.repo.ts` placeholder con codice morto

- **File**: `backend/src/repositories/shopify/marketplace-rules.repo.ts`
- **Problema**: già citato in C.2. Dopo aver completato la revisione possiamo decidere se eliminarlo o usarlo per un futuro override DB-driven delle rules (ora le rules sono in TS config)
- **Effort**: S
- **Origine**: PR 12

---

## D. Architettura — frontend states/store

### D.1 — State management ad-hoc

- **Problema**: dopo le decomposizioni (PR 15, 16), ogni "page" ha il suo hook custom (`usePaymentsData`, `useCrossChannelData`). Nessun store globale (Zustand/Jotai/Redux). Per ora va bene perché ogni page è isolata, ma se servisse condividere stato tra page sarebbe necessario introdurre uno store
- **Effort**: L (decisione + introduzione store)
- **Origine**: emergente da PR 15+16

---

## Voci risolte

(nessuna voce ancora — quando una voce viene fixata, va spostata qui con la PR di fix)
