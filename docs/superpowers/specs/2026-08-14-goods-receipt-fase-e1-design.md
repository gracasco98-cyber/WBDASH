# Arrivo merce / DDT — FASE E1 (core, senza upload) — Design

Data: 2026-08-14
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: continuazione diretta di FASE D (ordini di acquisto). Lo schema e la spec di FASE D avevano già anticipato questa fase (`receivedQty` su `PurchaseOrderLine`, stati `PARTIALLY_RECEIVED`/`RECEIVED` nell'enum, `DocumentSequence` pensato per essere riusato).

Prima di tre fasi concordate: **E1 (questo design, dati strutturati)** → E2 (upload/storage del PDF del DDT) → E3 (lettura AI del PDF che autocompila i campi, l'utente verifica sempre prima di salvare). E2/E3 fuori scope qui.

---

## 1. Obiettivo

Registrare l'arrivo fisico della merce contro un ordine di acquisto esistente: numero e data del DDT del fornitore, corriere/vettore, quantità ricevute per riga. Un ordine può ricevere più DDT (consegne parziali). La registrazione aggiorna automaticamente `receivedQty` sulle righe dell'ordine e lo stato logistico dell'ordine (`PARTIALLY_RECEIVED`/`RECEIVED`), riusando la state machine già esistente da FASE D.

**Fuori scope esplicito di questa fase**: nessun saldo di magazzino per prodotto (ledger di magazzino è una fase futura dedicata, per decisione esplicita dell'utente); nessun upload di file (FASE E2); nessuna lettura AI (FASE E3); nessuna generazione di scadenza di pagamento (resta scadenzario, fase separata); nessun impatto su `financialStatus` (resta `FASE G/M`).

## 2. Nuove entità

```prisma
model GoodsReceipt {
  id              String   @id @default(cuid())
  grnNumber       String   @unique  // "GR-2026-000001", stesso meccanismo di poNumber
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  receiptDate     DateTime      // data in cui la merce è arrivata fisicamente
  supplierDdtNumber String      // numero del DDT del fornitore (documento esterno)
  supplierDdtDate    DateTime   // data del DDT del fornitore
  carrier         String?       // corriere/vettore
  receivedById    String
  receivedBy      User          @relation(fields: [receivedById], references: [id])
  notes           String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  lines           GoodsReceiptLine[]

  @@index([purchaseOrderId])
  @@index([receivedById])
}

model GoodsReceiptLine {
  id                  String        @id @default(cuid())
  goodsReceiptId      String
  goodsReceipt        GoodsReceipt  @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  purchaseOrderLineId String
  purchaseOrderLine   PurchaseOrderLine @relation(fields: [purchaseOrderLineId], references: [id])
  receivedQty         Decimal       @db.Decimal(14, 4)
  notes               String?

  @@index([goodsReceiptId])
  @@index([purchaseOrderLineId])
}
```

`DocumentSequence` riusato con `documentType = "GOODS_RECEIPT"`, stesso meccanismo atomico di `poNumber` (`nextSequenceValue`/formattazione analoga a `formatPoNumber`, qui `formatGrnNumber`).

`GoodsReceipt`/`GoodsReceiptLine` sono **append-only**: nessuna modifica o cancellazione dopo la creazione (stesso principio di `PurchaseOrderStatusHistory` e `SupplierProductPriceHistory` — dato che genera storico economico/logistico non va sovrascritto).

## 3. Regole di business

- **Stati ordine ammessi per ricevere un DDT**: `CONFIRMED`, `IN_PRODUCTION`, `READY`, `PARTIALLY_SHIPPED`, `SHIPPED`, `PARTIALLY_RECEIVED`. Non ammesso su `DRAFT`, `SENT`, `CANCELLED`, `RECEIVED`, `COMPLETED`.
- **Nessun overage**: la somma di `receivedQty` (su tutti i DDT) per una riga non può superare `orderedQty` di quella riga — la registrazione fallisce con errore di validazione se una riga del DDT eccede il residuo (`orderedQty - receivedQty già registrata`). Il caso "arrivato più del previsto" resta fuori scope per ora, si può aggiungere in una fase dedicata se serve davvero.
- **Transizione di stato automatica**, non scelta manuale: dopo aver salvato il DDT, si ricalcola su tutte le righe dell'ordine se `receivedQty == orderedQty` ovunque → `RECEIVED`; se solo su alcune righe (o parzialmente su tutte) → `PARTIALLY_RECEIVED`. La transizione passa comunque dalla state machine esistente (`isValidTransition`) e scrive una riga in `PurchaseOrderStatusHistory` come le transizioni manuali di FASE D.
- **Estensione della whitelist** in `purchase-order-state-machine.ts` (oggi `PARTIALLY_RECEIVED`/`RECEIVED` non hanno transizioni in entrata): aggiunta di `PARTIALLY_RECEIVED`/`RECEIVED` come target validi da `CONFIRMED`, `IN_PRODUCTION`, `READY`, `PARTIALLY_SHIPPED`, `SHIPPED`, e `RECEIVED` come target valido da `PARTIALLY_RECEIVED`. Nessuna transizione manuale nuova nella UI esistente (il dropdown di FASE D) — questi target sono raggiungibili solo dal flusso di registrazione DDT, non da selezione manuale.
- **Una riga del DDT per riga dell'ordine** (non si registrano righe DDT per prodotti non presenti nell'ordine — un DDT con merce non ordinata è un errore di processo fuori scope qui, si gestisce fuori sistema per ora).

## 4. Componenti

**Repository layer:**
- `backend/src/repositories/purchasing/goods-receipts.repo.ts` (nuovo) — `createGoodsReceipt()` (transazione: genera `grnNumber`, crea `GoodsReceipt`+righe, incrementa `receivedQty` sulle `PurchaseOrderLine` coinvolte, ricalcola e applica la transizione di stato dell'ordine se necessario), `findGoodsReceiptsByOrderId()`.
- `backend/src/repositories/purchasing/document-sequence.repo.ts` (modifica) — nuova `formatGrnNumber()` accanto a `formatPoNumber()` (stesso pattern, prefisso `GR-`).

**State machine:**
- `backend/src/purchasing/purchase-order-state-machine.ts` (modifica) — estensione della whitelist come da §3.

**Routes:**
- `backend/src/purchasing/routes/goods-receipts.routes.ts` (nuovo) — `POST /purchase-orders/:id/goods-receipts` (crea un DDT), `GET /purchase-orders/:id/goods-receipts` (lista DDT di un ordine).

**Frontend:**
- `frontend/src/components/purchasing/GoodsReceiptForm.tsx` (nuovo) — form per registrare un DDT: numero/data DDT fornitore, corriere, quantità da ricevere per riga (precompilate col residuo `remainingQty` già calcolato dal backend, modificabili fino al residuo).
- `frontend/src/components/purchasing/GoodsReceiptsList.tsx` (nuovo) — lista dei DDT già registrati su un ordine (sola lettura).
- `frontend/src/app/acquisti/ordini/[id]/page.tsx` (modifica) — nuova sezione "DDT ricevuti" + azione "Registra DDT" (visibile solo quando lo stato dell'ordine è tra quelli ammessi, §3).
- `frontend/src/lib/api/purchase-orders.ts` (o file equivalente già esistente per le chiamate PO — verificare nome esatto in fase di piano) — nuove funzioni client per le due route sopra.

## 5. Testing

- Repository: Testcontainers, stesso pattern di `purchase-orders.repo.test.ts` — casi: DDT singolo che completa l'ordine (→ `RECEIVED`), DDT parziale (→ `PARTIALLY_RECEIVED`), secondo DDT che completa un ordine già `PARTIALLY_RECEIVED` (→ `RECEIVED`), tentativo di ricevere più del residuo (errore), tentativo di registrare un DDT su un ordine in stato non ammesso (errore), numerazione `grnNumber` sequenziale e senza collisioni sotto concorrenza (stesso test già esistente per `poNumber`, adattato).
- State machine: unit test puro per le nuove transizioni aggiunte alla whitelist.
- Route: integration test per i due endpoint (400 su input mancante, 404 su ordine inesistente, 409 su stato non ammesso o overage).

## 6. Rischi

- **Race su ricezioni concorrenti sullo stesso ordine**: due DDT registrati quasi simultaneamente sullo stesso ordine potrebbero, in teoria, superare `orderedQty` se il controllo residuo non è nella stessa transazione della scrittura. Mitigazione: `createGoodsReceipt()` calcola il residuo e scrive tutto (righe DDT + update `receivedQty` + eventuale transizione stato) in una singola `prisma.$transaction`, stesso pattern già usato da `createPurchaseOrder()`/`transitionPurchaseOrderStatus()`.
- **Numero DDT fornitore duplicato**: non blocchiamo un secondo DDT con lo stesso `supplierDdtNumber` su ordini diversi (fornitori diversi possono avere numerazioni che si sovrappongono) — nessun vincolo di unicità su quel campo, solo su `grnNumber` (il nostro numero interno).

## 7. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans` per il piano di implementazione.
