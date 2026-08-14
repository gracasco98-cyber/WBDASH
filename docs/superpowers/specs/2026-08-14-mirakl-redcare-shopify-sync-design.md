# Sync ordini Mirakl (Redcare/Shop-Apotheke) → Shopify — Design

Data: 2026-08-14
Stato: design approvato dall'utente, pronto per `writing-plans`.

---

## 1. Obiettivo

Gli ordini che arrivano dal marketplace Shop-Apotheke/Redcare (piattaforma Mirakl,
`shopapotheke.mirakl.net`, account IT + DE) oggi non entrano in Shopify. L'utente vuole che
ogni nuovo ordine Mirakl diventi un ordine Shopify reale (scala inventario, appare in
reportistica, gestibile/spedibile da lì), e che una volta evaso su Shopify il tracking torni
automaticamente a Mirakl per rispettare le SLA del marketplace (accettazione + spedizione
entro scadenza, pena penalità/sospensione account).

Le regole di classificazione marketplace (`backend/src/config/marketplace-rules.ts`) hanno
già `REDCARE_IT`/`REDCARE_DE` basate su tag Shopify (`redcare_it`/`redcare_de`): il polling
Shopify esistente (`backend/src/jobs/sync.job.ts`, ogni 60s) e il webhook
(`backend/src/webhooks/webhooks.ts`) assorbiranno automaticamente questi ordini in
`ShopifyOrder` una volta creati con il tag corretto — nessuna modifica necessaria a quella
parte del sistema.

## 2. Vincolo esplicito dell'utente

Il dominio `mirakl/` è **completamente separato da `amazon/`**: nessun import incrociato,
nessuna utility condivisa, nessun riuso di codice tra i due domini — anche se il job
periodico ricalca la stessa *forma* (storico + polling) di `amazon/sync.job.ts` e
`jobs/sync.job.ts`, il codice va scritto da zero specificamente per Mirakl.

## 3. Componenti

```
backend/src/mirakl/
  client.ts           // client REST Mirakl: OR11 (leggi ordini), OR23 (accetta), OR24 (spedisci+tracking)
  orderMapper.ts        // ordine Mirakl → input mutation Shopify orderCreate
  syncOrders.job.ts      // job periodico: leggi ordini nuovi → crea su Shopify → accetta su Mirakl
backend/src/repositories/mirakl/
  orders.repo.ts         // unico punto di accesso a Prisma per MiraklOrder (regola assoluta del repo)
```

1. **`client.ts`** — wrapper HTTP verso l'API Mirakl (auth header `Authorization: <API key>`,
   base URL `https://shopapotheke.mirakl.net/api`). Espone `fetchNewOrders()`,
   `acceptOrder(miraklOrderId)`, `shipOrder(miraklOrderId, trackingNumber, carrier)`.
2. **`orderMapper.ts`** — pura funzione di mapping, nessuna chiamata di rete: prende un
   ordine Mirakl (già validato) e produce l'input per la mutation GraphQL `orderCreate` di
   Shopify (righe per SKU 1:1, indirizzo di spedizione, importi, tag paese).
3. **`syncOrders.job.ts`** — orchestratore: usa `client.ts` + `orderMapper.ts` +
   `repositories/mirakl/orders.repo.ts` + la mutation `orderCreate` (nuova funzione in
   `services/shopify.service.ts`, accanto a quelle di lettura già esistenti).
4. **`repositories/mirakl/orders.repo.ts`** — CRUD tipizzato su `MiraklOrder` (vedi §4),
   nessuna logica di business.
5. **Estensione di `backend/src/webhooks/webhooks.ts`** — nuovo case per il topic
   `fulfillments/create`: se l'ordine evaso ha una riga `MiraklOrder` associata, chiama
   `client.ts#shipOrder()` con tracking/corriere dal payload fulfillment.
6. **Estensione di `services/shopify.service.ts`** — nuova funzione `createOrder()` che
   esegue la mutation `orderCreate`, riusando lo stesso client GraphQL/rate-limit handling
   già presente in quel file (letture e scritture nello stesso servizio, non duplicato).

## 4. Modello dati — nuova tabella `MiraklOrder`

```prisma
model MiraklOrder {
  id               String    @id @default(cuid())
  miraklOrderId    String    @unique   // id ordine lato Mirakl — chiave di idempotenza
  shopifyOrderId   String    @unique   // gid Shopify creato da questo ordine
  country          String              // "IT" | "DE" — determina tag redcare_it/redcare_de
  miraklState      String              // WAITING_ACCEPTANCE | SHIPPING | SHIPPED | ...
  trackingNumber   String?
  trackingSyncedAt DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

Serve sia per l'idempotenza (mai creare due volte lo stesso ordine Shopify se il job va in
overlap o va rieseguito dopo un errore parziale) sia come mappa inversa per il webhook di
fulfillment: da `shopifyOrderId` si risale a `miraklOrderId` per sapere se e come avvisare
Mirakl.

Migrazione: `prisma migrate dev --name add_mirakl_order`, nessuna modifica a tabelle
esistenti, nessuna migrazione distruttiva.

## 5. Flusso Mirakl → Shopify (job periodico)

1. `client.ts#fetchNewOrders()` chiama Mirakl OR11 (`GET /orders?order_state_codes=WAITING_ACCEPTANCE`).
2. Per ogni ordine: `repositories/mirakl/orders.repo.ts` verifica se `miraklOrderId` esiste già
   → se sì, skip (già processato o in corso).
3. `orderMapper.ts` traduce l'ordine in input Shopify: righe per SKU (mapping 1:1, confermato
   dall'utente — stessa SKU su entrambi i sistemi), indirizzo di spedizione, importi,
   `financialStatus: PAID` (l'ordine arriva già pagato dal marketplace),
   `inventoryBehaviour: DECREMENT_OBEYING_POLICY` (scala le scorte — stesso magazzino fisico
   dei canali diretti, confermato dall'utente), tag `redcare_it` o `redcare_de` in base al
   campo paese dell'ordine Mirakl.
4. `services/shopify.service.ts#createOrder()` esegue la mutation `orderCreate`.
5. Se la creazione Shopify va a buon fine: `repositories/mirakl/orders.repo.ts` salva la riga
   `MiraklOrder` (stato `WAITING_ACCEPTANCE`), poi `client.ts#acceptOrder()` chiama Mirakl OR23.
6. Se la creazione Shopify fallisce: **nessuna accettazione su Mirakl** — l'ordine resta
   `WAITING_ACCEPTANCE` lato Mirakl e verrà ritentato al giro successivo. Errore loggato su
   `AppErrorLog` con lo stesso `logError()` già usato da Shopify/Amazon.
7. Se la creazione Shopify va a buon fine ma l'accettazione Mirakl fallisce: la riga
   `MiraklOrder` esiste già (idempotenza garantita per il passo 2 al giro successivo, non
   verrà ricreato l'ordine Shopify), ma va ritentata solo `acceptOrder()` — il job distingue
   questo caso controllando se esiste già una riga `MiraklOrder` con `miraklState` ancora
   `WAITING_ACCEPTANCE` prima di richiamare `createOrder()`.

Frequenza: stesso ordine di grandezza del polling Shopify esistente (60s) o leggermente più
larga (es. 5 min) — dettaglio da fissare in fase di piano, non critico per il design.

## 6. Flusso Shopify → Mirakl (tracking)

1. Nuovo case in `handleWebhook()` (`webhooks.ts`) per `topic === "fulfillments/create"`.
2. Recupera l'`orderId` Shopify associato al fulfillment, cerca una riga `MiraklOrder` con
   quel `shopifyOrderId` via `repositories/mirakl/orders.repo.ts`.
3. Se non trovata: non è un ordine Redcare, nessuna azione (nessun impatto sugli altri canali).
4. Se trovata: estrae tracking number e corriere dal payload fulfillment,
   `client.ts#shipOrder()` chiama Mirakl OR24, poi aggiorna `trackingNumber`,
   `trackingSyncedAt`, `miraklState = "SHIPPED"` sulla riga.
5. Stesso pattern di idempotenza del webhook esistente: se `trackingSyncedAt` è già valorizzato
   per quel `shopifyOrderId`, skip (evita doppie chiamate OR24 su webhook duplicati/retry).

## 7. Errori e coerenza tra i due sistemi

- Ogni chiamata Mirakl (`client.ts`) è wrappata con try/catch e loggata su `AppErrorLog`
  (stesso schema/funzione già in uso), mai silenziosa.
- Nessuna scrittura verso Mirakl (accept/ship) avviene senza che la scrittura Shopify
  corrispondente sia già confermata — evita stati disallineati (es. ordine "accettato" su
  Mirakl ma inesistente su Shopify).
- Retry: affidato al prossimo giro del job periodico (per l'accettazione) o al retry nativo
  dei webhook Shopify (per il tracking) — nessun sistema di retry/queue dedicato, coerente
  con la semplicità del resto del sync Shopify esistente.

## 8. Configurazione

Nuove variabili d'ambiente (solo `.env` locale / Railway, mai nel repo):

```
MIRAKL_API_URL=https://shopapotheke.mirakl.net/api
MIRAKL_API_KEY=<chiave personale dell'utente>
```

La chiave condivisa in chat durante il brainstorming (`b11738ed-0ea5-4df2-9d4c-85a685ed8e8a`)
va considerata esposta essendo transitata in chiaro in conversazione: **da rigenerare** dalla
pagina `https://shopapotheke.mirakl.net/user/api-key` prima o subito dopo il primo deploy,
e la nuova chiave va inserita solo in `.env`/variabili Railway, mai incollata di nuovo in chat.

## 9. Testing

Stesso pattern già in uso nel repo (Vitest + Testcontainers + MSW):

- Mock delle risposte Mirakl (OR11/OR23/OR24) e della mutation `orderCreate` via MSW.
- Test di idempotenza: stesso ordine Mirakl processato due volte in due run del job →
  una sola riga `MiraklOrder`, una sola chiamata `orderCreate`.
- Test del mapping SKU/importi/indirizzo in `orderMapper.ts` (funzione pura, facile da testare
  in isolamento).
- Test del caso "Shopify ok, Mirakl accept fallisce" → verificare che al giro successivo non
  venga richiamato `createOrder()` ma solo `acceptOrder()`.
- Test del webhook `fulfillments/create`: con e senza riga `MiraklOrder` associata, e caso
  di webhook duplicato (idempotenza su `trackingSyncedAt`).

## 10. Rischi

- **`orderCreate` e permessi Shopify**: la mutation per creare ordini "reali" via Admin API
  richiede che l'app custom abbia lo scope `write_orders` con permesso di creazione ordini.
  Da validare con una chiamata di prova reale (contro un ordine di test) come primo passo
  dell'implementazione, prima di costruire il resto del flusso — se non disponibile, il design
  va rivisto (es. Draft Order + completamento manuale).
- **Doppio conteggio inventario**: se in futuro Redcare/Shop-Apotheke gestisse un proprio
  magazzino separato invece di condividere lo stock Shopify, il flag
  `DECREMENT_OBEYING_POLICY` andrebbe rivisto — oggi confermato dall'utente come stock
  condiviso.
- **SLA Mirakl**: se il job periodico si ferma (es. deploy, crash) per un periodo prolungato,
  gli ordini non vengono accettati in tempo su Mirakl — da monitorare come per gli altri job
  esistenti, nessuna mitigazione aggiuntiva prevista in questo design.
- **Segreto esposto in chat**: vedi §8, azione consigliata ma non bloccante per il design.

## 11. Fuori scope

- Nessuna UI frontend dedicata per visualizzare/gestire gli ordini Mirakl (i dati confluiscono
  nella dashboard Shopify/marketplace già esistente una volta creato l'ordine).
- Gestione di stati Mirakl diversi da accettazione/spedizione (es. resi, cancellazioni,
  contestazioni) — fuori scope, da trattare come task futuro dedicato se necessario.
- Multi-store Shopify: resta un solo store (`naturplan.it`), coerente con il gap noto #2 della
  roadmap di adeguamento in `CLAUDE.md`.

## 12. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans` per il piano di implementazione.
