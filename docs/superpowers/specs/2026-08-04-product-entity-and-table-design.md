# Entità Prodotto + Pagina Prodotti unificata — Design

## Contesto e problema

WBDASH non ha mai avuto un'entità "Prodotto" centrale. `asin`/`sku`/`productTitle` sono duplicati come stringhe libere e non collegate in almeno 6 tabelle (`AmazonOrderItem`, `AmazonProductSnapshot`, `AmazonProductCogs`, `AmazonInventory`, `AmazonAdSnapshot`/`AmazonAdKeywordSnapshot`/`AmazonAdSearchTerm`). Ogni pagina che vuole mostrare dati "per prodotto" fa i propri join ad-hoc, con logiche di calcolo duplicate e divergenti (es. `products.routes.ts` lato server vs `useCrossChannelData.ts` lato client, che oggi fa una chiamata API separata per ogni marketplace Amazon e raggruppa lato client per stringa `asin`).

Questo design introduce una vera entità Prodotto e ricostruisce la pagina `/prodotti` come tabella BI unificata, in stile Sellerboard (riferimento visivo fornito e approvato durante il brainstorming — screenshot conservati in `.superpowers/brainstorm/`).

Questo design **non parte da zero**: `docs/PROJECT_SPEC.md` §5 definiva già `products` + `product_marketplace_identifiers` + `product_cost_history` + `profit_calculations` prima che il codebase reale fosse importato. Qui li adattiamo al fatto che siamo single-tenant e mono-account Amazon reale, e li implementiamo finalmente.

## Scope

**Dentro questa fase:**
- Entità `Product` + `ProductIdentifier`, Amazon-first ma con schema pronto per Shopify (vedi Modello dati)
- Seed automatico per SKU condiviso tra marketplace Amazon + raggruppamento/rename manuale
- Nuovo endpoint di calcolo BI per prodotto, a join runtime (nessuna tabella aggregata materializzata in questa fase)
- Nuova pagina `/prodotti`: tema chiaro, 4 tile periodo, tabella con raggruppamento marketplace↔prodotto, colonne dense stile Sellerboard
- Validazione del report Amazon Ads per-ASIN (`spAdvertisedProduct`) come primo task, con fallback esplicito se non disponibile

**Fuori scope (rimandato, non silenziosamente scartato):**
- Popolamento dati Shopify in `ProductIdentifier` (schema pronto, dati no)
- Layer di aggregazione materializzato / motore profitto versionato (`product_cost_history`, `profit_calculations` con stati estimated/consolidated/reconciled) — prossima fase, si riprende `docs/superpowers/specs/2026-08-03-profit-engine-design.md`
- Feature "Spese" (costi manuali extra, editabili) — colonna mostrata in UI ma non collegata a nulla, sempre €0,00
- Colonna "Resi vendibili" (Sellable returns) — nessuna fonte dati oggi, mostrata come "—"
- Tema chiaro per il resto della dashboard (solo questa pagina cambia tema in questa fase — vedi Rischi)
- Sync Catalog Items API per BSR (campo già esistente in `AmazonProductSnapshot`, mai popolato — resta "—")

## Modello dati

```prisma
enum ChannelType {
  AMAZON
  SHOPIFY
}

enum ProductStatus {
  ACTIVE
  ARCHIVED
}

model Product {
  id          String   @id @default(cuid())
  name        String
  brand       String?
  status      ProductStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  identifiers ProductIdentifier[]
}

model ProductIdentifier {
  id          String      @id @default(cuid())
  productId   String
  product     Product     @relation(fields: [productId], references: [id])
  channelType ChannelType
  marketplace String      // Amazon: IT/DE/FR/ES/ALL_EU. Shopify: valore canale — non popolato in questa fase
  asin        String?     // solo Amazon
  sku         String?     // chiave di auto-matching
  createdAt   DateTime    @default(now())

  @@unique([channelType, marketplace, asin])
  @@index([productId])
  @@index([sku])
}
```

Additiva: nessuna modifica alle tabelle Amazon esistenti. `channelType` disaccoppia da subito la forma dei dati da "solo Amazon" senza dover riscrivere lo schema quando arriverà la fase cross-channel — ma in questa fase si creano solo righe `AMAZON`.

**Seed automatico** (migration one-off, eseguita una volta al deploy di questa fase):
- Un `Product` per ogni **SKU** distinto tra le ASIN Amazon già viste in `AmazonOrderItem`/`AmazonProductCogs`/`AmazonInventory` — stessa SKU su marketplace diversi (IT/DE/FR/ES) finisce sotto lo stesso `Product`.
- ASIN con SKU diverse (es. varianti di dosaggio/formato) restano `Product` separati finché non unite a mano.
- ASIN senza SKU: ciascuna diventa un `Product` a sé.

**Raggruppamento manuale**: azione "Sposta in un altro prodotto…" sulla riga espansa di un ASIN — cambia `productId` sull'identificatore. Se un `Product` resta senza identificatori dopo lo spostamento, passa a `status: ARCHIVED` (soft delete, mai cancellato — principio 16 CLAUDE.md). Rename: modifica inline del `name` sulla riga padre.

## Backend — calcolo BI per prodotto

Nuova funzione nel repository layer, `backend/src/repositories/amazon/products.repo.ts`:

```
resolveProductPerformance({ productIds?, marketplace, dateFrom, dateTo }):
  Array<{
    product: Product,
    identifiers: Array<ProductIdentifier & metriche>,
    aggregate: metriche   // somma degli identifiers
  }>
```

Per ogni `asin` risolto via `ProductIdentifier`, query aggregate (una sola per tutti gli ASIN coinvolti, non un giro per prodotto):

| Colonna tabella | Fonte dati | Stato |
|---|---|---|
| Unità | `AmazonOrderItem.quantityShipped` (sum) | ✅ esistente |
| Ricavi | `AmazonOrderItem.itemPrice` (sum) | ✅ esistente |
| Promo | `AmazonOrderItem.promotionDiscount` (sum) | ✅ esistente |
| Resi (count) | `AmazonSettlementTransaction` dove `amountType='Principal'` e importo negativo | ✅ esistente, stesso pattern di `products.routes.ts` |
| Costo reso (€) | stesso importo dei Resi sopra | ✅ esistente |
| % Resi | Resi(€) / Ricavi | derivato |
| Fee Amazon | `AmazonSettlementTransaction` (Commission, FBA fee, ecc.); fallback stima 15%/€3.80 se settlement non ancora arrivato (`hasRealFees`, pattern esistente) | ✅ esistente |
| COGS | `cogs.repo.findCogsForAsins()` — costo corrente, non versionato per data | ✅ esistente |
| Stock | `AmazonInventory.qtyTotal` per asin+marketplace | ✅ esistente |
| Ads spesa / ACOS reale | nuovo report `spAdvertisedProduct` (Amazon Ads API) | ⚠️ **da validare — Task 1 del piano** |
| Profitto lordo | Ricavi − Resi(€) − Ads − Fee Amazon − COGS | derivato |
| Profitto netto | Profitto lordo − Spese (sempre 0 in questa fase → netto = lordo) | derivato |
| Payout stimato | Ricavi − Resi(€) − Fee Amazon − Ads | derivato |
| Margine | Profitto netto / Ricavi | derivato |
| ROI | Profitto netto / COGS | derivato |
| Prezzo medio | Ricavi / Unità | derivato |
| Spese | — | fuori scope, sempre €0,00 |
| Resi vendibili | — | fuori scope, nessuna fonte dati, mostra "—" |
| BSR | `AmazonProductSnapshot.bsr` | esistente ma mai popolato, mostra "—" finché non c'è sync Catalog Items |

Nessun numero economico va mai stimato/allocato senza una fonte dati reale (principio 18 CLAUDE.md) — dove manca la fonte, la cella mostra "—", mai un valore calcolato "a occhio".

Nuovo endpoint: `GET /api/products/performance?marketplace=&from=&to=&groupBy=marketplace|product`. Il `groupBy` è puramente di presentazione: la query sottostante è identica, cambia solo l'albero di raggruppamento delle righe già risolte a livello asin+marketplace.

**Task 1 del piano di implementazione** (prima di tutto il resto): validare che `spAdvertisedProduct` risponda con dati reali sull'account Ads collegato. Il sync esistente (`ads-api.service.ts`) chiama già `spCampaigns`/`spKeywords`/`spSearchTerm` con successo — stesse credenziali, mai richiesto questo report specifico. Se non accessibile: le colonne Ads/ACOS mostrano "—", il resto della fase procede comunque.

## Frontend — pagina `/prodotti`

Sostituisce interamente il percorso "raggruppa per prodotto" di `CrossChannelProducts`/`useCrossChannelData` (le N chiamate per-marketplace + raggruppamento lato client) con un'unica chiamata al nuovo endpoint. La vista Shopify non raggruppata resta invariata (fuori scope, Amazon-first).

**Periodo e marketplace**: riuso di `PeriodContext`/`usePeriodFilter` e `MarketplaceFilterContext`/`useMarketplaceFilter`, già globali nell'app (stesso pattern del nav-reorg). Nessun nuovo selettore da costruire.

**4 tile periodo** (Oggi / Ieri / 7 giorni / 14 giorni): sempre visibili, ciascuna calcola in autonomia il proprio totale aggregato (chiamata `resolveProductPerformance` senza `productIds`, sui 4 range fissi) — indipendenti dal periodo globale selezionato. **Cliccare una tile imposta il periodo globale** (`PeriodContext`) su quel preset, il che aggiorna sia lo stile "attivo" della tile sia la tabella sottostante — stessa sorgente di stato, nessun periodo duplicato tenuto separatamente dalla tabella.

**Tabella**: due modalità di raggruppamento via toggle "Raggruppa per marketplace ▾" / "Raggruppa per prodotto":
- *Per marketplace*: riga padre = marketplace (Amazon.it, Amazon.de, …), righe figlie = prodotti in quel marketplace.
- *Per prodotto*: riga padre = `Product` aggregato, righe figlie = un ASIN+marketplace ciascuna.

Stesse righe risolte dal backend in entrambi i casi, solo raggruppamento diverso lato frontend. Azioni sulla riga figlia (solo vista "per prodotto"): "Sposta in un altro prodotto…", rename inline sul padre.

**Tema**: questa pagina usa tema chiaro (fedele al riferimento visivo approvato), mentre il resto di WBDASH resta scuro. Rischio di incoerenza visiva accettato consapevolmente in questa fase — vedi Rischi.

## Testing

- Unit: `resolveProductPerformance` — casi con settlement mancante (fallback stima fee), ASIN senza SKU, prodotto con 0 identificatori, Ads non disponibile → "—".
- Integration (Testcontainers, Postgres reale): endpoint `/api/products/performance` con fixture multi-marketplace, verifica che `groupBy=marketplace` e `groupBy=product` restituiscano lo stesso totale aggregato.
- Frontend (RTL): render tabella, espansione riga, toggle raggruppamento, azione "sposta in un altro prodotto" (mock endpoint), click su tile periodo aggiorna `PeriodContext`.

## Rischi

- **Incoerenza tema chiaro/scuro tra `/prodotti` e il resto dell'app** — accettato per questa fase, ma va deciso esplicitamente in un secondo momento (pagina isolata vs redesign dell'intera dashboard) prima che diventi debito visivo permanente.
- **`spAdvertisedProduct` potrebbe non essere accessibile** sull'account Ads reale — mitigato mettendolo come primo task di validazione, prima di costruire il resto sopra.
- **Seed per SKU può raggruppare erroneamente** se due prodotti diversi condividono per errore la stessa SKU in dati storici sporchi — mitigato dal fatto che il raggruppamento è sempre correggibile a mano via "Sposta in un altro prodotto…", nessun dato viene perso (solo `productId` cambia).
- **Performance del join a runtime** su periodi lunghi/tutti i marketplace — accettato in questa fase (approccio 1, scelto esplicitamente invece del layer aggregato), da rivalutare se la pagina risulta lenta in uso reale.
