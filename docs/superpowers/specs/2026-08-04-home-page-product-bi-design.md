# Home page come cuore della dashboard — Design

## Contesto

Durante l'esecuzione del piano `2026-08-04-product-entity-and-table.md` (branch `worktree-product-entity-table`, 11 task completati, review finale con verdetto "No — with fixes"), l'utente ha notato dal vivo che la pagina `/prodotti` appena costruita duplicava — con meno funzionalità — ciò che esiste già sulla home page (`frontend/src/app/page.tsx`, 533 righe): una sezione "BUSINESS INTELLIGENCE" (`SellerboardKpiCards.tsx`, 696 righe, 5 tile periodo con split Totale/Shopify/Amazon) e una sezione "PRODOTTI" (`CrossChannelProducts`, la stessa aggregazione client-side rotta diagnosticata all'inizio di questo lavoro, mai sostituita sulla home).

Questo design **non rifà il motore dati** — `Product`/`ProductIdentifier`, `resolveProductPerformance`, la route `/products/performance`, il client API (Task 1-8 del piano precedente) restano invariati e già review-ati. Cambia solo **dove** la UI monta questo motore (home page invece di `/prodotti`) e alcuni dettagli visivi approvati via mockup in questa sessione.

## Scope

**Dentro questa fase:**
- Sostituire `SellerboardKpiCards` con `PeriodTiles` (esteso da 4 a 5 tile: Oggi/Ieri/7gg/14gg/30gg, per parità con l'esistente) nella sezione "BUSINESS INTELLIGENCE" della home page — solo Amazon, niente più split Totale/Shopify/Amazon (il motore sotto è Amazon-first, uno split con due tab morte sarebbe fuorviante).
- Sostituire `CrossChannelProducts` con `ProductsPerformanceTable` nella sezione "PRODOTTI" della home page — niente più tab canale Tutti/Amazon/Web Store/Temu/Redcare (stesso motivo: motore Amazon-only per ora). Il toggle "Per Canale"/"Per Prodotto" già esistente si mappa 1:1 sul toggle marketplace/prodotto già costruito.
- **Miniatura prodotto** su ogni riga (padre e figlia) della tabella, sorgente `api.amazon.catalogImages` (endpoint già esistente e già usato da `useCrossChannelData.ts` per lo stesso scopo — nessun nuovo sync richiesto).
- **Palette colori**: tile con gradiente blu (`#4f7fe8→#3b6fd8`) per "Oggi" e verde acqua (`#4aa89a→#3d9188`) per gli altri periodi — sostituisce la palette beige di `SellerboardKpiCards.tsx` (`HEADER_COLORS`). Accenti profitto/margine positivi in teal (`#0d9488`) invece del verde standard.
- Rimuovere la voce "Prodotti" dalla sidebar (gruppo INVENTORY) ed eliminare la route `/prodotti` — la home page diventa l'unico posto con la tabella.
- **Fix obbligatori ereditati dalla review finale del piano precedente** (bloccanti, non opzionali — la UI non funzionerebbe altrimenti):
  - Il filtro periodo non arriva mai alla query (`getDateRange(filter, from, to)` ignora `from`/`to` a meno che `filter=custom`, ma nessun chiamante lo passa) — ogni richiesta torna sempre gli ultimi 30 giorni, le tile e il filtro periodo globale sono di fatto inerti.
  - L'endpoint richiama l'Amazon Ads API in modo sincrono dentro la request (creazione+polling report, fino a 45 minuti) — va spostato fuori dal path della richiesta.
- **Fix consigliati, stesso giro** (già touchati questi file, costo marginale basso): mostrare quando fee/COGS sono stimati invece di reali (oggi calcolati ma scartati dalla UI); error handling su rename/sposta prodotto.

**Fuori scope (invariato dal design precedente):**
- Dati multi-canale (Temu/Redcare/Web Store/Shopify) nel motore — resta Amazon-only, tracciato come lavoro futuro.
- Layer di aggregazione materializzato / motore profitto versionato — fase successiva, come già deciso.
- Tab Chart/P&L/Trends della home — non toccate da questo design.

## Cosa si riusa senza modifiche

Tutto il layer dati del piano precedente, già implementato e review-ato:
- `backend/prisma/schema.prisma` — `Product`/`ProductIdentifier`
- `backend/src/repositories/amazon/product.repo.ts`, `product-performance.repo.ts`
- `backend/src/scripts/seed-products-from-sku.ts`
- `backend/src/amazon/routes/products-performance.routes.ts` (struttura route — la logica di fetch Ads va corretta, vedi sopra)
- `frontend/src/lib/api/product-performance.ts`, tipi in `types.ts`

## Cosa cambia

**`frontend/src/components/products/PeriodTiles.tsx`** (già costruito nel piano precedente, va esteso):
- Aggiungere il 5° preset "30 giorni" (`last30`, già un valore valido di `PeriodPreset`)
- Sostituire i colori hardcoded con la palette blu/verde acqua approvata
- Fix del bug UTC/locale già trovato in review (`toISOString()` invece di `formatDateToIso` locale)

**`frontend/src/components/products/ProductsPerformanceTable.tsx`** (già costruito, va esteso):
- Aggiungere colonna miniatura: `api.amazon.catalogImages([...asins])` risolto una volta per tutte le righe visibili, stesso pattern già usato in `useCrossChannelData.ts`
- Aggiornare i colori (verde standard → teal `#0d9488` per valori positivi)
- Mostrare un badge/asterisco quando `hasRealFees`/`hasRealCogs` sono `false` (stimato, non verificato) — non c'è oggi nessun `hasRealCogs` nel motore, va aggiunto (stesso pattern di `hasRealFees` già esistente)
- Error handling (try/catch + messaggio) su `handleRename`/`handleMove`

**`frontend/src/app/page.tsx`**:
- Sezione "BUSINESS INTELLIGENCE": `<SellerboardKpiCards ... />` → `<PeriodTiles />`
- Sezione "PRODOTTI": `<CrossChannelProducts ... />` → `<ProductsPerformanceTable ... />`, con lo stesso stato locale già presente per il toggle "Per Canale"/"Per Prodotto" (`groupBy`)

**`frontend/src/components/layout/GlobalSidebar.tsx`**: rimuovere la voce "Prodotti" dal gruppo INVENTORY.

**Eliminare**: `frontend/src/app/prodotti/page.tsx` e il suo test — la route non esiste più.

**`backend/src/amazon/routes/products-performance.routes.ts`**:
- Fix filtro periodo: `getDateRange(from && to ? "custom" : filter, from, to)`
- Fix Ads: rimuovere la chiamata sincrona a `fetchSPAdvertisedProductReport` dal path della richiesta. Approccio: leggere lo spend ads da una tabella già sincronizzata in background (`AmazonAdSnapshot` o equivalente) tramite una nuova funzione di repository, invece di generare un report Amazon on-demand ad ogni caricamento pagina. Se non esiste già un job di sync per il report `spAdvertisedProduct` di Task 1, questo diventa un task dedicato di questa fase (sync in background, non nel path della richiesta).

**`backend/src/repositories/amazon/cogs.repo.ts`**: fix del bug pre-esistente segnalato in review finale — `findCogsForAsins` non deve più forzare `marketplace: "IT"` quando chiamato con `marketplace: "all"` (altrimenti i COGS specifici DE/FR/ES non arrivano mai al motore quando il filtro globale è "tutti i marketplace").

## Testing

- `PeriodTiles`/`ProductsPerformanceTable`: aggiornare i test esistenti per la 5ª tile, i nuovi colori (dove verificabili), la colonna immagine, i badge stimato/reale.
- `page.tsx`: test aggiornato per la sostituzione dei due componenti nelle sezioni corrispondenti.
- Route: nuovo test per il fix del filtro periodo (un ordine fuori range va escluso — esattamente il test che la review finale ha segnalato mancante).
- Route: nuovo test per il fix Ads (nessuna chiamata sincrona all'Ads API nel path della richiesta).
- `cogs.repo.ts`: nuovo test per `findCogsForAsins` con `marketplace: "all"` che restituisce righe di più marketplace, non solo IT.

## Rischi

- **Il fix Ads (spostare la lettura da sync-on-request a tabella pre-sincronizzata) potrebbe richiedere un nuovo job di sync** se quello per `spAdvertisedProduct` non esiste ancora — la validazione live di Task 1 non ha mai potuto confermare l'accesso reale al report (nessuna credenziale disponibile nel worktree). Questo rischio esisteva già nel piano precedente, non è nuovo.
- **Rimozione di `/prodotti`**: se qualcuno ha salvato un link diretto a quella URL, va a 404. Rischio basso (funzionalità appena introdotta in questa stessa sessione, non ancora in produzione).
