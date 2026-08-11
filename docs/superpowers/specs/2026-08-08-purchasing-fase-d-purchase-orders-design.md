# FASE D — Ordini Fornitore (PurchaseOrder) — Design

Data: 2026-08-08
Stato: design approvato dall'utente, pronto per `writing-plans`. Nessun codice scritto, nessuna migrazione applicata.
Origine: terza fase implementata del modulo Acquisti/Fornitori/Contabilità, dopo FASE B (master data, mergiata) e FASE C (fornitori, mergiata su `develop` in `b3409ab`). Segue integralmente l'architettura approvata in `docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md`, con due decisioni specifiche a questa fase confermate dall'utente (vedi §5).

---

## 1. Stato di partenza (verificato)

- Branch: `develop`, aggiornato a `b3409ab` (merge PR #4 — FASE C). Nessuna modifica non committata.
- Entità riusabili già presenti: `Supplier` (FASE C), `Warehouse` e `PaymentTerm` (FASE B), `Product` (preesistente), `User` (per `buyerId`/`changedById`).
- Entità che questa fase introduce: `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatusHistory`, `DocumentSequence`.
- Entità esplicitamente **non** introdotte qui: `PurchaseCost` (FASE F, insieme al landed cost), `GoodsReceipt`/`DeliveryNote` (FASE E).

## 2. Scope di questa fase

Dentro:
- Creazione ordine fornitore con righe prodotto, tramite un vero product-picker (sostituisce il paste-id lasciato aperto da FASE C).
- Numerazione documentale atomica (`DocumentSequence`), riusabile dalle fasi successive (ricezioni, fatture, prima nota useranno lo stesso meccanismo con `documentType` diverso).
- Macchina a stati per `logisticStatus`, con storico transizioni.
- Frontend end-to-end: lista, creazione, dettaglio con azioni di stato — stesso livello di demoabilità di FASE B/C.

Fuori (rimandato):
- `PurchaseCost` e qualunque calcolo di landed cost (FASE F).
- Qualunque logica di ricezione merce, DDT, movimento di magazzino (FASE E+).
- Transizioni reali di `financialStatus` (il campo esiste, resta `OPEN` finché non arrivano Fatture/Pagamenti in FASE G/M).
- Stati `PARTIALLY_RECEIVED`, `RECEIVED`, `COMPLETED` del `logisticStatus`: esistono nell'enum (l'enum è definito una volta sola, per intero, com'è convenzione nel progetto) ma **non sono raggiungibili** da nessuna transizione whitelisted in questa fase — diventano raggiungibili quando FASE E introduce la logica di ricezione che li innesca.

## 3. Schema Prisma

Convenzioni riprodotte esattamente da FASE B/C: `id String @id @default(cuid())`, importi `Decimal @db.Decimal(14,4)`, `createdAt`/`updatedAt` su ogni modello mutabile, indice su ogni FK, enum Prisma reali per insiemi di valori chiusi, company-wide (nessun `amazonAccountId`/`organizationId`).

**`DocumentSequence`**
```
documentType String
year         Int
lastValue    Int @default(0)
@@unique([documentType, year])
```
Incremento via `UPDATE "DocumentSequence" SET "lastValue" = "lastValue" + 1 WHERE ... RETURNING "lastValue"` dentro la transazione che crea il documento — atomico per costruzione in Postgres (nessun lock esplicito, nessuna race condition anche con richieste concorrenti). Se la riga `(documentType, year)` non esiste ancora, creata con `lastValue = 1` in modo atomico (upsert dentro la stessa transazione).

**`PurchaseOrder`**
```
poNumber            String @unique   // "PO-2026-000001", da DocumentSequence
supplierId           → Supplier
orderDate            DateTime
currency             String
logisticStatus       PurchaseOrderLogisticStatus @default(DRAFT)
financialStatus      PurchaseOrderFinancialStatus @default(OPEN)   // statico in questa fase
buyerId              → User        // default: utente autenticato che crea l'ordine
warehouseId          → Warehouse
expectedDeliveryDate DateTime?
deliveryAddress      String?
shippingMethod       String?
incoterm             String?
paymentTermId        → PaymentTerm
internalNotes        String?
supplierNotes        String?
quoteReference       String?
createdAt / updatedAt
@@index([supplierId]) @@index([logisticStatus]) @@index([orderDate])
```

**`PurchaseOrderLine`**
```
purchaseOrderId → PurchaseOrder
productId        → Product
supplierSku      String?
description      String
orderedQty       Decimal
receivedQty      Decimal @default(0)   // scritto solo da FASE E in poi, qui resta 0
unitOfMeasure    String
unitPrice        Decimal
discountPct      Decimal?
taxableAmount    Decimal
vatAmount        Decimal
totalAmount      Decimal
createdAt / updatedAt
@@index([purchaseOrderId]) @@index([productId])
```
`remainingQty` **non è un campo**: sempre calcolato (`orderedQty - receivedQty`) nel repository layer al momento della lettura, mai persistito — stessa scelta motivata nell'architettura FASE A per evitare divergenza.

Rispetto all'ERD completo di FASE A, questa fase **omette deliberatamente** `expectedDeliveryDate` ed `expectedLotNumber` da `PurchaseOrderLine` (restano solo a livello testata `PurchaseOrder`): sono utili quando esiste già un flusso di ricezione da confrontare (FASE E), qui aggiungerebbero campi senza alcun consumatore. Non è un errore di trascrizione — si aggiungono in FASE E se e quando serviranno davvero.

**`PurchaseOrderStatusHistory`** (append-only, mai modificata)
```
purchaseOrderId → PurchaseOrder
fromStatus       PurchaseOrderLogisticStatus
toStatus         PurchaseOrderLogisticStatus
changedById       → User
changedAt        DateTime @default(now())
note             String?
@@index([purchaseOrderId])
```

**Enum**
```
enum PurchaseOrderLogisticStatus {
  DRAFT
  SENT
  CONFIRMED
  IN_PRODUCTION
  READY
  PARTIALLY_SHIPPED
  SHIPPED
  PARTIALLY_RECEIVED   // non raggiungibile in questa fase
  RECEIVED             // non raggiungibile in questa fase
  COMPLETED            // non raggiungibile in questa fase
  CANCELLED
}

enum PurchaseOrderFinancialStatus {
  OPEN
  PARTIALLY_INVOICED   // non raggiungibile in questa fase
  INVOICED             // non raggiungibile in questa fase
  PARTIALLY_PAID        // non raggiungibile in questa fase
  PAID                  // non raggiungibile in questa fase
}
```

## 4. Macchina a stati

Modulo puro, senza dipendenze DB, testabile in isolamento: `backend/src/purchasing/purchase-order-state-machine.ts`.

```
DRAFT → SENT → CONFIRMED → IN_PRODUCTION → READY → PARTIALLY_SHIPPED → SHIPPED
```
Da qualunque stato precedente `COMPLETED` (cioè da `DRAFT` a `SHIPPED` incluso) → `CANCELLED`, transizione eccezionale sempre permessa in questa fase.

Rappresentata come `Map<PurchaseOrderLogisticStatus, Set<PurchaseOrderLogisticStatus>>`. Nessun salto di stato consentito (es. `DRAFT` → `CONFIRMED` diretto è rifiutato anche se qualcuno lo forza via chiamata API diretta). Ogni transizione valida scrive una riga in `PurchaseOrderStatusHistory` nella stessa transazione che aggiorna `PurchaseOrder.logisticStatus`.

## 5. Decisioni confermate dall'utente per questa fase

1. **`PurchaseCost` esclusa da FASE D** — entra in FASE F col resto del landed cost, per non anticipare uno schema che qui non avrebbe ancora logica di allocazione.
2. **Product-picker costruito ora** — necessario perché `PurchaseOrderLine` richiede la scelta di un prodotto reale da UI; sostituisce il pattern paste-id lasciato aperto da FASE C.
3. **Fase end-to-end** — backend + frontend demoabile, stesso pattern di FASE B/C, non solo API.

## 6. Backend

- `backend/src/repositories/purchasing/document-sequence.repo.ts` — funzione `nextSequence(documentType, year, tx)`, usata dentro la transazione del chiamante (non apre una propria transazione).
- `backend/src/repositories/purchasing/purchase-orders.repo.ts` — CRUD ordine + righe in un'unica `prisma.$transaction` alla creazione (numerazione + ordine + righe), lettura con `remainingQty` calcolato, transizione di stato con validazione whitelist + scrittura `PurchaseOrderStatusHistory` nella stessa transazione.
- `backend/src/purchasing/purchase-order-state-machine.ts` — modulo puro (nessun import Prisma).
- Routes in `backend/src/purchasing/routes/purchase-orders.routes.ts`, montate con `requireAuth` (stesso pattern di `suppliers.routes.ts`): `GET /`, `GET /:id`, `POST /` (crea con righe annidate), `POST /:id/transition` (body: `toStatus`, `note?`).
- Nessuna chiamata Prisma fuori dal repository layer (regola assoluta del progetto).

## 7. Frontend

- `frontend/src/app/acquisti/ordini/page.tsx` — lista ordini, filtri per stato/fornitore.
- `frontend/src/app/acquisti/ordini/nuovo/page.tsx` — form creazione: selezione fornitore, magazzino, condizione di pagamento, righe multiple con product-picker (select con ricerca testuale su `Product`, stesso principio dei combobox già in uso nel resto del frontend — nessuna libreria nuova).
- `frontend/src/app/acquisti/ordini/[id]/page.tsx` — dettaglio ordine, righe, storico stato, pulsanti azione per le transizioni valide dallo stato corrente (calcolate lato client dalla stessa whitelist, ma **validate comunque server-side** — il client non è la fonte di verità).
- Nuova voce "Ordini Fornitore" nella sidebar, area Acquisti (`GlobalSidebar.tsx`), sostituendo l'eventuale placeholder "Prossimamente" se presente.

## 8. Test

- `document-sequence.repo.test.ts` — incluso un test di concorrenza esplicito: N creazioni simultanee non producono `poNumber` duplicati (richiesta esplicita §36 dell'architettura originale).
- `purchase-order-state-machine.test.ts` — tutte le transizioni valide e almeno le invalide più probabili (salto di stato, transizione da `CANCELLED`).
- `purchase-orders.repo.test.ts` — Testcontainers reali, creazione con righe, calcolo `remainingQty`, transizione di stato con storico.
- `purchasing-purchase-orders.test.ts` — integration test a livello routes.
- `tsc --noEmit` backend + frontend.
- Verifica E2E manuale in browser: crea ordine multi-riga → transizione di stato → verifica storico, come nelle fasi precedenti.

## 9. Rischi

- **Concorrenza su `DocumentSequence`**: mitigata dall'`UPDATE...RETURNING` atomico, ma va verificata con un test reale, non solo assunta corretta per costruzione.
- **Enum con valori non ancora raggiungibili** (`PARTIALLY_RECEIVED`, `RECEIVED`, `COMPLETED`, gli stati `financialStatus` oltre `OPEN`): rischio che un futuro sviluppatore (umano o agente) li scriva per errore prima che FASE E/F/G li attivino davvero. Mitigazione: la whitelist della state machine è l'unico punto che decide le transizioni ammesse — anche se il valore esiste nell'enum, non è raggiungibile finché la whitelist non viene estesa nella fase che lo introduce.
- **Product-picker come primo combobox-con-ricerca del modulo Acquisti**: nessun precedente diretto in `frontend/src/components/purchasing/` (FASE C non ne aveva bisogno) — va verificato se esiste già un pattern riusabile altrove nel frontend (es. selettore account Amazon) prima di scriverne uno nuovo da zero.

## 10. Branch

`feature/purchase-orders`, da `develop` aggiornato (`b3409ab` o successivo).

## 11. File da creare/modificare

- `backend/prisma/schema.prisma` (+ migrazione `prisma migrate dev`, mai `db push`, conferma esplicita utente prima di applicarla)
- `backend/src/repositories/purchasing/document-sequence.repo.ts`
- `backend/src/repositories/purchasing/purchase-orders.repo.ts`
- `backend/src/repositories/purchasing/products.repo.ts` (minimal read-only projection of `Product` for the picker — not the same as `repositories/amazon/product.repo.ts`, which carries full `ProductIdentifier` relations this picker doesn't need)
- `backend/src/purchasing/purchase-order-state-machine.ts`
- `backend/src/purchasing/routes/purchase-orders.routes.ts`
- `backend/src/server.ts` (mount route)
- `backend/tests/repositories/purchasing/document-sequence.repo.test.ts`
- `backend/tests/repositories/purchasing/purchase-orders.repo.test.ts`
- `backend/tests/unit/purchase-order-state-machine.test.ts`
- `backend/tests/integration/purchasing-purchase-orders.test.ts`
- `frontend/src/app/acquisti/ordini/page.tsx`
- `frontend/src/app/acquisti/ordini/nuovo/page.tsx`
- `frontend/src/app/acquisti/ordini/[id]/page.tsx`
- `frontend/src/components/purchasing/ProductPicker.tsx`
- `frontend/src/lib/api/purchase-orders.ts`
- `frontend/src/components/layout/GlobalSidebar.tsx` (voce Ordini Fornitore)

## 12. Prossimo step

Design approvato dall'utente in sessione. Prossimo passo: `writing-plans` per trasformare questo documento in un piano di implementazione eseguibile task-per-task, stesso processo già seguito per FASE B e FASE C.
