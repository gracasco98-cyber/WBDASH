# Fase 1 — Dashboard Vendite e Profitti

> **Aggiornato 2026-07-30**: il 2026-07-30 è stato importato in WBDASH un codebase reale e già in produzione che copre la maggior parte di questa fase. Questo documento ora distingue esplicitamente **cosa è già fatto** da **cosa manca ancora**, invece di essere un backlog da zero. Vedi `../PROJECT_SPEC.md` §5bis per lo schema reale e `CLAUDE.md § Roadmap di adeguamento` per i gap architetturali.

## 1. Obiettivo

Dare visibilità affidabile e aggiornata su vendite e profitto reale su Amazon, multi-marketplace (IT, DE, FR, ES), con aggiornamento almeno ogni 30 minuti.

**Stato: raggiunto.** Il sync ordini Amazon gira ogni 5 minuti (batte il requisito), copre IT/DE/FR/ES/ALL_EU. Il **multi seller-account**, gap principale rispetto all'obiettivo originale, è stato implementato il 2026-07-31 (backend completo; selettore account in UI ancora da fare) — vedi §3.

## 2. Funzionalità — stato reale

| Funzionalità | Stato | Dove |
|---|---|---|
| Collegamento account Amazon SP-API (OAuth) | ✅ fatto | `amazon-auth.js`, `backend/src/amazon/token.service.ts`, `backend/src/amazon/sp-api.service.ts` |
| Gestione credenziali cifrate | ✅ fatto (2026-07-31) — AES-256-GCM, `AmazonAccount.*Enc` | `backend/src/utils/crypto.ts`, `repositories/amazon/accounts.repo.ts` |
| Gestione multi seller-account | ✅ fatto (2026-07-31), backend completo | vedi §3 |
| Gestione multi-marketplace (IT, DE, FR, ES) | ✅ fatto | campo `marketplace` su quasi tutti i modelli Amazon |
| Sincronizzazione ordini ogni 30 minuti | ✅ superato (ogni 5 min) | `backend/src/amazon/sync.job.ts` |
| Sincronizzazione transazioni finanziarie | ✅ fatto (settlement ogni 4h) | `AmazonSettlement`, `AmazonSettlementTransaction`, `backend/src/amazon/settlement.service.ts` |
| Importazione report (inventario, advertising) | ✅ fatto | `AmazonInventory`, `AmazonAdSnapshot` e affini |
| Inserimento costo prodotto (standard / medio ponderato) | ✅ fatto, con storico temporale | `AmazonProductCogs`, `AmazonCogsPriceEntry` |
| Caricamento costi advertising | ✅ fatto | `backend/src/amazon/ads-api.service.ts`, `ads-sync.service.ts` |
| Calcolo profitto stimato e consolidato | ⚠️ parziale — P&L calcolato a query-time, non versionato/riproducibile | `frontend/src/app/amazon/pl/page.tsx` — manca un vero profit engine (vedi `PROJECT_SPEC.md` §4) |
| Dashboard giornaliera + confronti (ieri/settimana/mese) | ✅ fatto | `frontend/src/components/dashboard/**`, `PeriodContext`, `usePeriodFilter` |
| Filtri (marketplace, brand, prodotto/SKU/ASIN, periodo, valuta) | ✅ fatto (account incluso, 2026-07-31) | `AmazonFilterBar`, `FilterBar`, `AmazonAccountSelector` |

## 3. Multi seller-account — fatto (2026-07-31)

Implementato sui branch `migration/multi-account-amazon` + `feature/multi-account-remaining-gaps`:

1. ✅ Modello `AmazonAccount` con credenziali SP-API (EU + NA)/Ads cifrate (AES-256-GCM).
2. ✅ `amazonAccountId` aggiunto a tutti i 15 modelli del dominio Amazon, vincoli di unicità ricalcolati per account. Database era vuoto → nessun backfill necessario.
3. ✅ Ogni query/repository filtra per account (via contesto `AsyncLocalStorage`, non parametro esplicito — vedi `docs/tech-debt.md` F.1).
4. ✅ **UI: selettore account** — `AmazonAccountSelector` nell'header (badge statico con 0/1 account, dropdown con 2+), persistenza in `localStorage`, `apiUrl()` inietta `amazonAccountId` su ogni chiamata API. `AmazonAccountGuard` impedisce a qualsiasi pagina Amazon di caricare dati finché la selezione non è risolta (evita i 500 "No Amazon account in scope" con account ambiguo).

Vedi `docs/tech-debt.md` sezione F per il dettaglio completo (bug di cache cross-account, bug di race sull'auth trovato e corretto, region NA e JOIN a chiave composita — tutti chiusi al 2026-07-31).

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

1. `chore/prisma-baseline-migration` — ~~creare la prima migrazione versionata~~ **fatto il 2026-08-01**, vedi `CLAUDE.md` roadmap #0.
2. `feature/profit-engine` — motore di calcolo profitto versionato (stimato/consolidato, per ordine, append-only). **Spec approvata** in `docs/superpowers/specs/2026-08-03-profit-engine-design.md`, implementazione non ancora iniziata.
3. `feature/data-completeness-state` — aggiungere il flag di completezza dati a livello di risposta API e mostrarlo in ogni KPI card. Dipende dal profit engine (voce 2).
4. ~~`migration/decimal-money`~~ — **fatto e verificato il 2026-07-30** (database vuoto, nessun backfill dati). Vedi `../tech-debt.md` E.2. Verifica end-to-end con Testcontainers su Postgres reale: 250 test passati.
5. ~~`migration/multi-account-amazon`~~ — **fatto** (backend 2026-07-31, selettore UI 2026-07-31/08-01), vedi §3 e `../tech-debt.md` F.
6. `feature/raw-payload-persistence` — introdurre una tabella (o storage esterno) per conservare il payload raw ricevuto da Amazon/Shopify prima della normalizzazione, per permettere ricalcoli futuri senza re-fetch.
7. `refactor/settlement-reconciliation` — chiudere il gap di `docs/tech-debt.md` A.8 (delta tra `AmazonSettlement.totalAmount` e somma delle transazioni) con un widget di riconciliazione esplicito.
8. Voci minori già tracciate in `docs/tech-debt.md` sezione A (cutoff date disallineati, AOV su gross invece di net, ordini cancellati trattati diversamente tra Shopify e Amazon) — da valutare caso per caso, sono comportamenti lockati nei test attuali.
9. ~~`feature/nav-reorg`~~ — **fatto il 2026-08-03**: sidebar riorganizzata per area di business (Finance/Inventory/Marketing/Supporto/Admin) invece che per canale, filtro Marketplace globale, pagine unificate cross-channel Prodotti/Ordini. Spec in `docs/superpowers/specs/2026-08-03-nav-reorg-design.md`. Le tile BI (periodi personalizzabili, confronto, metriche Sales/Profit/Costi/VAT) restano un sotto-progetto separato, rimandato, dipendente dal profit engine (voce 2).

Ogni branch richiede: test propri, lint/typecheck/build verdi (`ci-backend`/`ci-frontend`), migrazione + rollback documentati quando tocca lo schema.

## 7. Fuori scope per Release 1

Magazzino/ledger, fornitori, ordini di acquisto, fatture/prima nota/scadenzario, listing e marketing (Fase 2+ della visione originale). Il forecasting Amazon già presente (`AmazonForecastCalibration`, `AmazonForecastSnapshot`) anticipa parte della Fase 2 ("Intelligence") — non toccarlo se non richiesto, è già testato e in uso.
