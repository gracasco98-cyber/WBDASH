# Profit Engine versionato — Design

Data: 2026-08-03
Stato: approvato in brainstorming, in attesa di piano di implementazione.

## Contesto e motivazione

`PROJECT_SPEC.md` §4 identifica il motore di profitto versionato come il gap principale tra WBDASH oggi e la visione originale: il P&L (`frontend/src/app/amazon/pl/page.tsx`, `backend/src/amazon/routes/products.routes.ts`) è calcolato a query-time, senza persistenza né versionamento. Un ricalcolo (nuovo prezzo COGS, arrivo di un settlement) non lascia traccia storica — viola il principio non negoziabile #11 di `CLAUDE.md` ("nessun dato economico va sovrascritto senza storico").

Questa sessione di brainstorming è nata da una richiesta di redesign UI/UX (menu e dashboard), ma è stata scomposta in tre sotto-progetti sequenziali, di cui questo è il primo:

1. **Profit engine versionato** (questo documento)
2. Tile BI (periodi personalizzabili, confronto, metriche Sales/Profit/Costi/VAT) — consuma l'output di (1)
3. Riorganizzazione menu/navigazione per aree di business (Finance/Inventory/Marketing/Supporto) invece che per canale

Il P&L attuale già distingue implicitamente stimato/consolidato: se non ci sono ancora fee reali da settlement, stima commissione al 15% del lordo e FBA fee a €3,80/unità (numeri fissi hardcoded). Questo motore formalizza la stessa distinzione ma usa le **calibrazioni storiche reali per marketplace** (`AmazonForecastCalibration`, sistema EWMA già in produzione) al posto dei numeri fissi.

## Scope

- **Dentro**: calcolo profitto per ordine Amazon, 2 stati (`estimated`, `consolidated`), versionato e append-only, backfill sugli ordini storici già sincronizzati.
- **Fuori** (esplicitamente rimandato): stato `reconciled` (richiede il widget di riconciliazione settlement, gap A.8 di `tech-debt.md`, già in backlog separato); tile BI e riorganizzazione menu (sotto-progetti 2 e 3); supporto multi-valuta reale (NA/UK) — il campo `exchangeRate` esiste nello schema ma resta `1` finché non arrivano ordini non-EUR reali (oggi l'account reale vende solo in IT/EUR).

## Architettura — trigger del calcolo

Il calcolo si aggancia direttamente ai punti di sync esistenti (non un job schedulato separato):

- **`ingestOrderRows`** (`backend/src/amazon/sync.job.ts`): dopo l'upsert di un ordine nuovo o aggiornato, chiama `calculateOrderProfit(accountId, orderId, "estimated")`.
- **Sync settlement** (`backend/src/amazon/settlement.service.ts`): dopo l'upsert delle transazioni di un settlement, per ogni ordine collegato chiama `calculateOrderProfit(accountId, orderId, "consolidated")`.
- La funzione di calcolo è isolata e pura in un nuovo modulo `backend/src/amazon/profit-engine/calculate.ts` — nessuna logica di sync al suo interno, testabile in isolamento indipendentemente dal punto di innesco.
- **Protezione critica**: ogni chiamata a `calculateOrderProfit` nei punti di innesco è avvolta in try/catch — un errore nel motore di profitto non deve mai far fallire il sync di ordini/settlement (già in produzione, collaudato). Errore loggato, sync continua.
- L'aggregato per le dashboard (`DailyProfitMetric`, vedi sotto) è ricalcolato separatamente, in modo leggero e schedulato (non ad ogni singolo ordine) — è derivato e ricostruibile da `ProfitCalculation`, non deve essere istantaneo. Cadenza: una volta al termine di ogni sync settlement (stesso ritmo di oggi, ogni 4h) più un rebuild giornaliero di sicurezza — dettaglio implementativo da confermare in fase di piano, non blocca l'approvazione di questo design.

## Modello dati

```prisma
model ProfitCalculation {
  id                 String   @id @default(cuid())
  amazonAccountId    String
  orderId            String              // FK logico ad AmazonOrder.amazonOrderId (via amazonAccountId+orderId)
  state              String              // "estimated" | "consolidated"
  formulaVersion     Int
  inputsJson         Json                // snapshot di tutti gli input usati, per riproducibilità
  currency           String              // valuta originale marketplace (oggi sempre EUR)
  exchangeRate       Decimal  @default(1) // riservato per NA/UK futuri, non usato attivamente ora
  resultCurrency     Decimal            // risultato in valuta marketplace
  resultEur          Decimal            // risultato in EUR (= resultCurrency oggi)
  calculatedAt       DateTime @default(now())

  @@index([amazonAccountId, orderId, calculatedAt])
}

model DailyProfitMetric {
  id              String   @id @default(cuid())
  amazonAccountId String
  date            String              // YYYY-MM-DD
  marketplace     String
  state           String              // stato "peggiore" tra gli ordini del giorno: se anche solo 1 è ancora "estimated", il giorno è "estimated"
  revenue         Decimal
  profit          Decimal
  ordersCount     Int
  rebuiltAt       DateTime @updatedAt

  @@unique([amazonAccountId, date, marketplace])
}
```

`ProfitCalculation` non si sovrascrive mai (nuova riga ad ogni transizione di stato, storico completo). `DailyProfitMetric` è derivata e ricostruibile: si rigenera aggregando l'ultima versione di `ProfitCalculation` per ordine — alimenterà le tile BI del sotto-progetto 2.

## Logica di calcolo

```
grossRevenue  = Σ itemPrice (righe ordine, AmazonOrderItem)
vat           = Σ itemTax               ← già tracciato per riga, scorporo diretto, nessuna stima di aliquota
promoDiscount = Σ promotionDiscount
netRevenue    = grossRevenue - vat - promoDiscount

cogs = da AmazonProductCogs/AmazonCogsPriceEntry (costo reale alla data dell'ordine, già
       versionato per validFrom — NON dipende mai dallo stato stimato/consolidato)
```

**Stato `estimated`** — usa i ratio calibrati per marketplace (`AmazonForecastCalibration`):
```
commission = grossRevenue × calibration.rCommission
fbaFee     = grossRevenue × calibration.rFba
adsCost    = grossRevenue × calibration.rAds
storage    = grossRevenue × calibration.rStorage
refunds    = grossRevenue × calibration.rRefunds
otherFees  = grossRevenue × calibration.rOther
```

**Stato `consolidated`** — usa gli importi reali dalle transazioni di settlement collegate a quell'ordine (`AmazonSettlementTransaction`, stesso raggruppamento per `amountType` già usato in `products.routes.ts`):
```
commission = Σ transazioni amountType='Commission' per quell'ordine
fbaFee     = Σ transazioni amountType='FBAPerUnitFulfillmentFee'
adsCost/storage/refunds/otherFees = stessa logica, importi reali
```

```
netProfit = netRevenue - commission - fbaFee - adsCost - storage - refunds - otherFees - cogs
```

`formulaVersion` è una costante nel modulo (`FORMULA_VERSION = 1`), incrementata a mano solo se cambia la formula — i calcoli storici restano con la versione con cui sono nati, mai riscritti retroattivamente.

**Caso limite — COGS mancante**: se non esiste un `AmazonProductCogs` per l'ASIN alla data dell'ordine, `cogs = 0` e viene loggato un warning (non bloccante) — il calcolo procede comunque, ma il margine risulterà sovrastimato finché il COGS non viene inserito.

## Test e verifica

- **Unit test puri** su `calculateOrderProfit`: ordine normale, con sconto promo, con reso/rimborso, COGS mancante, stato `estimated` vs `consolidated`, margine negativo.
- **Integration test (Testcontainers)**: dopo `ingestOrderRows` su ordini fixture → nasce una riga `ProfitCalculation` stato `estimated`; dopo settlement fixture → nasce una **nuova** riga stato `consolidated` (si verifica che quella `estimated` resti intatta, mai sovrascritta).
- **Verifica esplicita della protezione try/catch**: si simula un fallimento nel motore (es. calibrazione mancante per un marketplace) e si conferma che il sync di ordini/settlement completa comunque con successo.

## Migrazione e rollout

- Nuovi modelli (`ProfitCalculation`, `DailyProfitMetric`) → migrazione versionata con `prisma migrate dev` (baseline già stabilita in `chore/prisma-baseline-migration`). Nessun impatto su tabelle esistenti, solo aggiunta.
- **Backfill retroattivo**: uno script una tantum applica `calculateOrderProfit` a tutti gli ordini già sincronizzati (dati già nel DB, nessuna nuova chiamata SP-API) — il motore è subito utile su tutti i dati reali già presenti (43 ordini IT al momento di questo design, più storico da maggio 2026 in poi).

## Prossimo passo

Invocare la skill `writing-plans` per trasformare questo design in un piano di implementazione a step verificabili.
