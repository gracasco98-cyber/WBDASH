# Fase 1 — Dashboard Vendite e Profitti

> **Aggiornato 2026-07-30**: il 2026-07-30 è stato importato in WBDASH un codebase reale e già in produzione che copre la maggior parte di questa fase. Questo documento ora distingue esplicitamente **cosa è già fatto** da **cosa manca ancora**, invece di essere un backlog da zero. Vedi `../PROJECT_SPEC.md` §5bis per lo schema reale e `CLAUDE.md § Roadmap di adeguamento` per i gap architetturali.

## 1. Obiettivo

Dare visibilità affidabile e aggiornata su vendite e profitto reale su Amazon, multi-marketplace (IT, DE, FR, ES), con aggiornamento almeno ogni 30 minuti.

**Stato: raggiunto, con una limitazione.** Il sync ordini Amazon gira ogni 5 minuti (batte il requisito), copre IT/DE/FR/ES/ALL_EU. La limitazione è il **multi seller-account**: l'obiettivo originale lo richiedeva fin da Release 1, ma il codebase importato è single-account (un solo set di credenziali SP-API in `.env`). Vedi §3.

## 2. Funzionalità — stato reale

| Funzionalità | Stato | Dove |
|---|---|---|
| Collegamento account Amazon SP-API (OAuth) | ✅ fatto | `amazon-auth.js`, `backend/src/amazon/token.service.ts`, `backend/src/amazon/sp-api.service.ts` |
| Gestione credenziali cifrate | ⚠️ parziale — credenziali in `.env`, non cifrate a riposo in DB | — |
| Gestione multi seller-account | ❌ non fatto (single-account) | vedi §3 |
| Gestione multi-marketplace (IT, DE, FR, ES) | ✅ fatto | campo `marketplace` su quasi tutti i modelli Amazon |
| Sincronizzazione ordini ogni 30 minuti | ✅ superato (ogni 5 min) | `backend/src/amazon/sync.job.ts` |
| Sincronizzazione transazioni finanziarie | ✅ fatto (settlement ogni 4h) | `AmazonSettlement`, `AmazonSettlementTransaction`, `backend/src/amazon/settlement.service.ts` |
| Importazione report (inventario, advertising) | ✅ fatto | `AmazonInventory`, `AmazonAdSnapshot` e affini |
| Inserimento costo prodotto (standard / medio ponderato) | ✅ fatto, con storico temporale | `AmazonProductCogs`, `AmazonCogsPriceEntry` |
| Caricamento costi advertising | ✅ fatto | `backend/src/amazon/ads-api.service.ts`, `ads-sync.service.ts` |
| Calcolo profitto stimato e consolidato | ⚠️ parziale — P&L calcolato a query-time, non versionato/riproducibile | `frontend/src/app/amazon/pl/page.tsx` — manca un vero profit engine (vedi `PROJECT_SPEC.md` §4) |
| Dashboard giornaliera + confronti (ieri/settimana/mese) | ✅ fatto | `frontend/src/components/dashboard/**`, `PeriodContext`, `usePeriodFilter` |
| Filtri (marketplace, brand, prodotto/SKU/ASIN, periodo, valuta) | ✅ fatto (account escluso, non esiste ancora il concetto) | `AmazonFilterBar`, `FilterBar` |

## 3. Multi seller-account: perché manca e come chiuderlo

Il codebase adottato è nato come dashboard per un singolo account Amazon + singolo store Shopify. Introdurre multi-account richiede:

1. Un modello `AmazonAccount` (o riuso di `User`/nuova tabella) con credenziali SP-API proprie, oggi in `.env` globali.
2. Aggiungere `amazonAccountId` a tutti i modelli Amazon (`AmazonOrder`, `AmazonSyncJob`, `AmazonSettlement`, ecc.) — migrazione non banale su tabelle già popolate in produzione.
3. Aggiornare ogni query/repository per filtrare per account, non solo per marketplace.
4. UI: selettore account in `AmazonFilterBar` e simili.

Questo è il gap più grande rispetto all'obiettivo originale di Release 1. Va trattato come una migrazione dedicata (branch `migration/multi-account-amazon`), pianificata a parte, non come un side-effect di un altro task — tocca dati economici reali già in produzione.

## 4. Stati dei dati (obbligatorio in UI)

**Stato: non implementato esplicitamente.** Oggi la dashboard mostra valori senza un flag di completezza (stimato/consolidato/riconciliato) esplicito in UI, anche se i dati sottostanti (settlement arrivato o no) lo permetterebbero implicitamente. Resta un requisito valido per quando si costruisce il profit engine versionato:

- **Provvisorio**: solo ordini, senza dati finanziari né costi completi.
- **Stimato**: ordini + costo prodotto, advertising eventualmente mancante.
- **Consolidato**: transazioni finanziarie arrivate (settlement).
- **Riconciliato**: verificato con settlement/fatture.

## 5. KPI Release 1

Fatturato, Ordini, Unità vendute, Profitto, Margine %, Advertising spend, ACOS, TACOS, ROAS, Costo merce, Commissioni Amazon, Costi FBA, Rimborsi, Prezzo medio, Profitto per unità — **tutti già presenti** in `SellerboardKpiCards`, `AmazonKpiCards`, `AmazonOverviewCards`. Manca solo l'esposizione esplicita dello stato di completezza per ciascun KPI (§4).

## 6. Backlog aggiornato — cosa resta da fare

Non più uno scaffolding da zero: sono estensioni incrementali su un sistema già funzionante. Ogni riga è una branch indipendente e verificabile, da `develop`, seguendo `CONTRIBUTING.md`.

1. `chore/prisma-baseline-migration` — creare la prima migrazione versionata (`prisma migrate dev --name init`) sullo schema esistente, per stabilire una baseline prima di qualsiasi altra modifica.
2. `feature/profit-engine` — estrarre la logica di calcolo P&L da `frontend/src/app/amazon/pl/page.tsx` e dalle query dirette in un modulo backend dedicato, versionato (formula version, input snapshot, stati stimato/consolidato/riconciliato), con fixture di test sui casi limite economici (vendita con sconto, rimborso parziale, fee tardiva, cambio valuta, ordine cancellato).
3. `feature/data-completeness-state` — aggiungere il flag di completezza dati a livello di risposta API e mostrarlo in ogni KPI card.
4. `migration/decimal-money` — migrare i campi monetari da `Float` a `Decimal` in `backend/prisma/schema.prisma` (priorità alta, rischio di arrotondamento su dati finanziari reali). Da pianificare con l'utente vista la sensibilità.
5. `migration/multi-account-amazon` — vedi §3. Migrazione maggiore, da discutere e pianificare a parte prima di iniziare.
6. `feature/raw-payload-persistence` — introdurre una tabella (o storage esterno) per conservare il payload raw ricevuto da Amazon/Shopify prima della normalizzazione, per permettere ricalcoli futuri senza re-fetch.
7. `refactor/settlement-reconciliation` — chiudere il gap di `docs/tech-debt.md` A.8 (delta tra `AmazonSettlement.totalAmount` e somma delle transazioni) con un widget di riconciliazione esplicito.
8. Voci minori già tracciate in `docs/tech-debt.md` sezione A (cutoff date disallineati, AOV su gross invece di net, ordini cancellati trattati diversamente tra Shopify e Amazon) — da valutare caso per caso, sono comportamenti lockati nei test attuali.

Ogni branch richiede: test propri, lint/typecheck/build verdi (`ci-backend`/`ci-frontend`), migrazione + rollback documentati quando tocca lo schema.

## 7. Fuori scope per Release 1

Magazzino/ledger, fornitori, ordini di acquisto, fatture/prima nota/scadenzario, listing e marketing (Fase 2+ della visione originale). Il forecasting Amazon già presente (`AmazonForecastCalibration`, `AmazonForecastSnapshot`) anticipa parte della Fase 2 ("Intelligence") — non toccarlo se non richiesto, è già testato e in uso.
