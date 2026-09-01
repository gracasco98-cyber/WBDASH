# Marketing / Redcare Keyword BI — Design

Data: 2026-08-31
Branch: `feature/marketing-redcare-keyword-bi`
Stato: approvato in chat dall'utente, in attesa di piano di implementazione (`writing-plans`)

## Contesto e motivazione

WBDASH non ha oggi nessuna visibilità sul posizionamento organico dei prodotti Naturplan nella
ricerca interna dei marketplace Redcare (IT: `redcare.it`) e Shop Apotheke (DE: `shop-apotheke.com`).
L'integrazione Mirakl esistente (`backend/src/mirakl/**`) copre solo ordini — nessun endpoint di
ranking/ricerca è esposto né da Mirakl né dal portale ads separato `retail.sa-tech.de` (Redcare Ad
Server Self Service), che gestisce solo campagne Sponsored Product Ads con report aggregati.

Durante l'investigazione (sessione 2026-08-27) è stato verificato che la pagina di ricerca
pubblica di entrambi i siti (stessa piattaforma Next.js/Algolia,
"home-one") embedda nel proprio HTML un blob JSON pulito e non autenticato:

```html
<script>window[Symbol.for("InstantSearchInitialResults")] = { "<indexName>": { "results": [{ "hits": [...], "nbHits": N, ... }] } }</script>
```

- IT: dominio `www.redcare.it`, index Algolia `products_mktplc_prod_IT_it`
- DE: dominio `www.shop-apotheke.com`, index Algolia `products_mktplc_prod_DE_de`

Ogni `hit` contiene `ean`, `productName`, `price`, `best_offer.seller.name`, `best_offer.type`
("MIRAKL" per le offerte Naturplan), e — poiché la richiesta server-side usa `getRankingInfo=true`
— un blocco `_rankingInfo.promoted`/`promotedByReRanking` che segnala se Algolia AI ReRanking ha
spostato quell'hit dalla posizione di ranking base. Questo **non** è equivalente a "sponsorizzato a
pagamento": le campagne Search SPA di `retail.sa-tech.de` sembrano iniettate con un meccanismo
diverso, non identificato in questo payload. Va quindi trattato ed etichettato come segnale di
ranking grezzo, non come flag pubblicitario.

Verificato con richieste HTTP dirette (curl, nessun login, nessun header speciale) su entrambi i
domini. Il pattern DE è confermato solo strutturalmente (stesso blob, stesso formato) — non ancora
con un EAN reale Naturplan DE, da confermare al primo giro del job.

## Obiettivo

Aggiungere un'area "Marketing" a WBDASH con una sezione Redcare che permette di:
1. Cercare una keyword e vedere subito la classifica live (IT o DE) con posizione, venditore,
   prezzo, segnale di re-ranking.
2. "Tracciare" una riga di risultato (il proprio prodotto o un competitor) per costruirne uno
   storico giornaliero di posizione nel tempo.
3. Confrontare nel tempo, sullo stesso grafico, il proprio prodotto e i competitor pinnati per la
   stessa keyword.

Il tab "Amazon" nella stessa area Marketing viene creato come placeholder disabilitato ("in
arrivo") — fuori scope da questo task.

## Architettura

### Backend — nuovo dominio `backend/src/redcareSearch/`

Stesso pattern strutturale di `backend/src/mirakl/` (dominio autonomo, nessuna dipendenza da altri
domini):

- **`client.ts`** — `fetchSearchResults(market: "IT" | "DE", keyword: string): Promise<RedcareSearchResult>`.
  Esegue la GET pubblica verso il dominio del mercato richiesto, estrae il blob
  `InstantSearchInitialResults` dal body HTML e fa `JSON.parse`. Config di mercato (dominio, nome
  index Algolia) centralizzata in una mappa `MARKET_CONFIG` nello stesso file. **Se il blob non
  viene trovato o il parsing fallisce, lancia un errore esplicito** (mai un risultato vuoto o
  parziale silenzioso) — un cambio di formato lato Next.js/Algolia deve emergere nei log del job,
  non corrompere silenziosamente lo storico con snapshot vuoti.
- **`service.ts`** — `searchLive()` per la ricerca on-demand (nessuna scrittura DB); logica di
  matching EAN→posizione dentro l'array `hits` per il job di tracking.
- **`jobs/redcareKeywordTracking.job.ts`** — esecuzione giornaliera (stesso meccanismo di
  scheduling già in uso per i job Mirakl/Amazon esistenti, da verificare in fase di piano). Per
  ogni combinazione univoca `(market, keyword)` tra i watch attivi fa **una sola richiesta HTTP**,
  poi risolve la posizione per tutti gli EAN tracciati (proprio prodotto + competitor pinnati) su
  quella keyword da quell'unica risposta. Errori di singola keyword non bloccano le altre (stesso
  pattern di isolamento già usato in `mapOrdersSkippingMalformed`/intraday Amazon ads job).

### Repository layer

`backend/src/repositories/marketing/redcareWatch.repo.ts` — unico punto di accesso Prisma per
questo dominio, come da regola assoluta del repo (route/service/job non chiamano mai Prisma
direttamente).

### Schema dati (Prisma)

```prisma
model MarketingKeywordWatch {
  id        String   @id @default(cuid())
  market    String   // "IT" | "DE"
  keyword   String
  ean       String
  label     String?  // nome amichevole (es. nome competitor)
  isOwn     Boolean  @default(false)
  active    Boolean  @default(true) // soft delete: mai cancellare, lo storico resta leggibile
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  snapshots MarketingKeywordSnapshot[]

  @@unique([market, keyword, ean])
}

model MarketingKeywordSnapshot {
  id                  String   @id @default(cuid())
  watchId             String
  watch               MarketingKeywordWatch @relation(fields: [watchId], references: [id])
  checkedAt            DateTime @default(now())
  found                Boolean
  position             Int?     // 1-based, null se non trovato nei risultati restituiti
  nbHits               Int
  price                Decimal? @db.Decimal(10, 2)
  sellerName           String?
  productName          String?
  promoted             Boolean?
  promotedByReRanking  Boolean?

  @@index([watchId, checkedAt])
}
```

Importi monetari `Decimal` (principio 13 del CLAUDE.md). Nessuna cancellazione fisica dei watch
(principio 16, soft delete). Migrazione dedicata via `prisma migrate dev`, da sottoporre a
conferma esplicita prima dell'esecuzione su `develop`/produzione (principio 6).

### API (routes)

`backend/src/routes/marketing/redcare.routes.ts`:

- `GET /api/marketing/redcare/search?market=IT|DE&q=<keyword>` — ricerca live, nessuna scrittura.
- `POST /api/marketing/redcare/watches` — body `{ market, keyword, ean, label?, isOwn }`, crea o
  riattiva (`active=true`) un watch esistente.
- `GET /api/marketing/redcare/watches?market=&keyword=` — lista watch attivi con ultimo snapshot.
- `GET /api/marketing/redcare/watches/:id/history?days=30` — serie storica snapshot per grafico.
- `DELETE /api/marketing/redcare/watches/:id` — soft delete (`active=false`).

### Frontend

`frontend/src/app/marketing/`:

- Layout con tab "Amazon" (disabilitato, badge "in arrivo") e "Redcare".
- `/marketing/redcare/page.tsx`:
  - Selettore mercato IT/DE.
  - Campo ricerca libera → tabella risultati live: posizione, prodotto, venditore, prezzo, badge
    "AI re-ranked" quando `promotedByReRanking` è true (etichetta neutra, non "sponsorizzato").
    Bottone "Traccia" per riga, con scelta rapida "come mio prodotto" / "come competitor" +
    etichetta libera.
  - Sezione "Keyword monitorate": raggruppata per keyword, un grafico Recharts (linea, coerente
    con lo stile grafici già in uso in WBDASH) per posizione nel tempo, con il proprio prodotto e
    i competitor pinnati sovrapposti sullo stesso grafico per confronto diretto. Azione per
    disattivare un watch.
- `frontend/src/lib/api/marketing.ts` — client API tipizzato, stesso pattern di `lib/api/mirakl.ts`.

## Rischi e limiti noti

- **Fragilità struttura**: il blob `InstantSearchInitialResults` è un dettaglio implementativo non
  documentato pubblicamente di Next.js/Algolia InstantSearch SSR; può cambiare senza preavviso.
  Mitigato isolando tutto il parsing in `client.ts` (un solo punto da correggere) e fallendo in
  modo esplicito e loggato invece di produrre dati silenziosamente sbagliati.
- **Rate limiting / ToS**: il job gira 1 volta al giorno e deduplica le richieste per keyword
  univoca, ma resta traffico automatizzato verso siti pubblici di terzi. Da verificare con
  Redcare/account manager prima di lasciarlo attivo in produzione a lungo termine — non bloccante
  per costruire la feature, ma da tenere presente.
- **`promoted`/`promotedByReRanking` ≠ "sponsorizzato a pagamento"**: mostrato come segnale grezzo
  con etichettatura neutra, non come indicatore di spesa pubblicitaria.
- **DE non ancora validato end-to-end**: struttura confermata, ma nessun EAN Naturplan reale
  testato su `shop-apotheke.com` prima di questo task. Il primo giro del job/della UI lo confermerà;
  se il matching EAN fallisce sistematicamente per il mercato DE, va trattato come bug da
  investigare separatamente, non silenziato.

## Fuori scope (esplicitamente)

- Tab Amazon della sezione Marketing (solo placeholder disabilitato).
- Volume di ricerca per keyword (non disponibile da nessuna fonte investigata).
- Distinzione affidabile paid/organic (il meccanismo di iniezione delle ad Search SPA nei risultati
  non è stato identificato).
- Alert/notifiche automatiche su variazioni di posizione.
