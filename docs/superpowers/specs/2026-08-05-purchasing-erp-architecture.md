# Modulo Acquisti, Fornitori, COGS, Scadenzario, Prima Nota — Architettura proposta

Data: 2026-08-05
Stato: FASE A (analisi + ERD) — in attesa di approvazione. Nessun codice scritto, nessuna migrazione applicata.
Origine: spec fornita dall'utente (`Implementazione Modulo Gestionale Acquisti e Contabilità.pdf`, 39 sezioni).

---

## 1. Stato progetto

Verificato prima di proporre qualunque cosa (`git status`, `git branch`, `schema.prisma` completo, `CLAUDE.md`, moduli esistenti):

- **Branch**: lavoro isolato su `docs/purchasing-erp-architecture` (worktree dedicato `.claude/worktrees/purchasing-erp`), diramato da `origin/develop` aggiornato. Nessuna modifica non committata estranea trovata.
- **Entità già esistenti riutilizzabili**:
  - `Product` / `ProductIdentifier` — anagrafica prodotto già presente (nome, brand, status, identificatori multi-canale Amazon/Shopify). **Riuso diretto** come `productId` in `SupplierProduct` e nelle righe ordine/ricezione — nessun duplicato.
  - `User` — autenticazione già completa (bcrypt, sessioni, MFA). Campo `role` oggi è una stringa piatta (`"master" | "admin" | "user"`) usata per gating dell'area admin — **non è un RBAC granulare**, va esteso (vedi §11).
  - `AuditLog` — esiste ma è specifico per eventi auth/utenti (`actorId`/`targetUserId` puntano solo a `User`, `action` è un enum di stringhe auth-specifiche). **Non riusabile direttamente** per entità generiche come ordini/fatture/pagamenti — propongo un log dedicato (§11), stesso spirito, scope diverso, per non toccare codice auth già testato.
  - `AmazonInventory` — snapshot di giacenza Amazon (FBA/FBM), sincronizzato da SP-API, sola lettura. **Concetto diverso** dal magazzino fisico aziendale che questo modulo deve gestire (merce ricevuta da fornitori, movimentata internamente). Le due cose **non vanno fuse** ora — restano sistemi paralleli, una riconciliazione futura è fuori scope (stesso pattern già usato per `docs/tech-debt.md` A.8 sulla riconciliazione settlement).
  - `AmazonProductCogs` / `AmazonCogsPriceEntry` — COGS oggi è un valore "corrente" per ASIN, inserito manualmente, usato per calcolare il profitto Amazon. **Non è collegato a un flusso di acquisto reale** (nessun ordine fornitore, nessuna ricezione dietro). Il nuovo modulo costruisce il COGS "vero" (da Landed Cost su ricezione reale) — i due sistemi convivono; unificarli è un passo successivo esplicito, non implicito in questo lavoro.
- **Entità che NON esistono affatto**: `Supplier`, `Customer`, `Organization`, `Warehouse`, `PurchaseOrder` e tutto il flusso a valle, `BankAccount`, `CashJournalEntry`, `PaymentTerm`, qualunque file-attachment/storage.
- **Multi-tenant**: `CLAUDE.md` documenta esplicitamente che WBDASH è single-tenant, nessun modello `Organization` — è un gap noto, non affrontato "di nascosto" da nessun task passato. Rilevante perché la spec fornita include `organizationId` in `PurchaseOrder` — vedi §11 per la decisione proposta.
- **Convenzioni di schema osservate ovunque** (da riprodurre esattamente, non da reinventare): `id String @id @default(cuid())`; importi `Decimal @db.Decimal(14, 4)`, mai `Float`; percentuali/ratio restano `Float`; `createdAt DateTime @default(now())` / `updatedAt DateTime @updatedAt` su ogni modello mutabile; enum Prisma reali quando l'insieme di valori è chiuso e stabile (es. `ChannelType`, `ProductStatus` già esistono); indice su ogni FK; `@@unique` per le chiavi naturali; nessuna migrazione già applicata va toccata; `prisma migrate dev`, mai `db push`, per tutto ciò che arriva su `develop`/`main`.
- **Repository layer**: regola assoluta del progetto — solo `backend/src/repositories/**` accede a Prisma. Il nuovo modulo userà `backend/src/repositories/purchasing/**`, mai chiamate dirette da route/service.

## 2. Architettura proposta

- **Nuovo dominio applicativo** `backend/src/purchasing/` (stesso pattern di `backend/src/amazon/`): `routes/`, eventuali `services/` per logica non banale (algoritmo landed cost, generazione scadenze), niente accesso diretto a Prisma.
- **Repository layer** `backend/src/repositories/purchasing/`: un file per aggregato (`suppliers.repo.ts`, `purchase-orders.repo.ts`, `goods-receipts.repo.ts`, `inventory-lots.repo.ts`, `supplier-invoices.repo.ts`, `payment-terms.repo.ts`, `deadlines.repo.ts`, `riba.repo.ts`, `bank-accounts.repo.ts`, `payments.repo.ts`, `cash-journal.repo.ts`, `purchasing-audit.repo.ts`) — stesso stile già in uso in `repositories/amazon/**`.
- **Scoping**: questo modulo **non** è scoped per `AmazonAccount` (non è un dominio Amazon) e **non** avrà `organizationId` (nessun modello `Organization` esiste — vedi decisione in §11). È company-wide, come `User`/`Product` oggi.
- **Frontend**: nuova area `frontend/src/app/acquisti/**` (coerente con la sidebar riorganizzata per aree di business già introdotta dal nav-reorg: Finance/Inventory/Marketing/Supporto/Admin — "Acquisti" diventa una nuova area di primo livello, con "Fornitori", "Ordini Fornitore", "Ricezioni", "Fatture Fornitore" sotto Inventory/Finance secondo§33) più `frontend/src/app/anagrafiche/**` per Fornitori/Banche/Magazzini/Condizioni pagamento, e `frontend/src/app/amministrazione/**` per Scadenzario/Prima Nota/Banche/Pagamenti.
- **Motore di calcolo isolato**: come per il profit-engine (spec parallela, in pausa), la logica di landed cost e generazione scadenze vive in moduli puri testabili (`backend/src/purchasing/landed-cost.ts`, `backend/src/purchasing/deadline-schedule.ts`), separati dall'orchestrazione DB.
- **Transazioni**: ogni azione contabilmente rilevante (conferma ricezione → movimento magazzino → eventuale creazione lotto; registrazione pagamento → aggiornamento scadenza + fattura + prima nota + movimento banca) gira in una singola `prisma.$transaction(...)`, con vincoli `@@unique` come seconda linea di difesa contro doppie richieste concorrenti (stesso principio già richiesto esplicitamente dalla spec).

## 3. ERD

Elenco minimo richiesto dalla spec (23 entità) più 3 aggiunte necessarie per coerenza architetturale, segnalate esplicitamente: `Warehouse` (referenziato da `GoodsReceipt`/`InventoryLot` ma non nell'elenco esplicito), `StockMovement` (il "ledger di magazzino" che la spec richiede esplicitamente al §8 del PDF — `InventoryLot` da solo è un record di lotto, non un giornale di movimenti append-only), `DocumentSequence` (numerazione atomica server-side per `PO-2026-000001` e simili, generica per riuso su più tipi di documento invece di un contatore ad hoc per tipo).

Convenzioni sotto: **PK** sempre `id String @id @default(cuid())` (omesso per brevità). **FK** con `@relation`. **Decimal** = `Decimal @db.Decimal(14,4)`.

### Anagrafiche

**Supplier**
- Identificazione: `legalName, tradeName, internalCode String @unique, isActive Boolean, supplierType String, country, language, defaultCurrency`
- Fiscali: `vatNumber, taxCode, foreignVatNumber, sdiCode, pec, taxRegime, fiscalNotes`
- Indirizzo: `addressLine, streetNumber, postalCode, city, province, country`
- Pagamenti: `defaultPaymentMethod PurchasePaymentMethod, defaultPaymentTermId → PaymentTerm, paymentDays Int?, bankName, iban, bic, ribaEnabled Boolean, fixedPaymentDays Int[]`
- `createdAt, updatedAt, deletedAt DateTime?` (soft delete — §29 vieta cancellazione fisica di dati usati)
- Indici: `@@unique([internalCode])`, `@@index([isActive])`, `@@index([vatNumber])`

**SupplierContact** — `supplierId → Supplier, name, role, email, phone, whatsapp, isPrimary Boolean, notes`

**SupplierProduct** (relazione N:N Supplier↔Product con dati commerciali)
- `supplierId → Supplier, productId → Product, supplierSku, supplierProductName, standardPrice Decimal, currency, moq Int, orderMultiple Int, leadTimeDays Int, unitsPerCarton Int?, unitsPerPallet Int?, weightKg Decimal?, conditions String?, lastPriceDate DateTime, isPreferredSupplier Boolean, notes`
- `@@unique([supplierId, productId])`

**SupplierProductPriceHistory** — mai sovrascritta, sempre nuova riga (stesso pattern già in uso per `AmazonCogsPriceEntry`)
- `supplierProductId → SupplierProduct, price Decimal, currency, validFrom DateTime, source String, note?`
- `@@index([supplierProductId, validFrom])`

**Warehouse** *(aggiunta necessaria, non nell'elenco esplicito)* — `name, code String @unique, address?, isActive Boolean`

**PaymentTerm** — configurabile, non hardcodato (§14 esplicito)
- `name, type String, endOfMonth Boolean, fixedDay Int?, paymentMethod PurchasePaymentMethod, isActive Boolean`
- **PaymentTermInstallmentRule** (righe figlie, una per rata): `paymentTermId → PaymentTerm, installmentNumber Int, offsetDays Int, percentage Decimal` — la somma di `percentage` su tutte le righe di un `PaymentTerm` deve fare 100 (vincolo applicativo, verificato alla creazione/modifica del piano rate)

**BankAccount** — `bankName, alias, accountHolder, iban String @unique, bic?, currency, openingBalance Decimal, openingBalanceDate DateTime, isActive Boolean, accountingCode?, notes` — **nessuna credenziale bancaria memorizzata** (§18 esplicito)

### Ordini di acquisto

**PurchaseOrder**
- `poNumber String @unique` (formato `PO-2026-000001`, generato da `DocumentSequence`), `supplierId → Supplier, orderDate DateTime, currency, logisticStatus PurchaseOrderStatus, financialStatus PurchaseOrderFinancialStatus` (stati separati — §11 del PDF, esplicito), `buyerId → User, warehouseId → Warehouse, expectedDeliveryDate DateTime?, deliveryAddress?, shippingMethod?, incoterm?, paymentTermId → PaymentTerm, internalNotes?, supplierNotes?, quoteReference?`
- **Nessun `organizationId`** — vedi decisione §11.
- `@@index([supplierId])`, `@@index([logisticStatus])`, `@@index([orderDate])`

**PurchaseOrderLine** — `purchaseOrderId → PurchaseOrder, productId → Product, supplierSku?, description, orderedQty Decimal, receivedQty Decimal @default(0), remainingQty` (derivato, non salvato — vedi nota sotto), `unitOfMeasure, unitPrice Decimal, discountPct Decimal?, taxableAmount Decimal, vatAmount Decimal, totalAmount Decimal, expectedDeliveryDate?, expectedLotNumber?`
> `remainingQty` è **calcolato** (`orderedQty - receivedQty`), non un campo persistito indipendente — evita che i due numeri divergano per un bug di aggiornamento parziale.

**PurchaseCost** (costi accessori dell'ordine — trasporto, dogana, packaging, ecc.) — `purchaseOrderId → PurchaseOrder, costType String, amount Decimal, currency, allocationStrategy String` (`BY_QUANTITY | BY_VALUE | BY_WEIGHT | MANUAL`, default `BY_QUANTITY` per §9/§10 del PDF), `notes?`

**PurchaseOrderStatusHistory** — append-only, mai modificata — `purchaseOrderId → PurchaseOrder, fromStatus, toStatus, changedAt DateTime, changedById → User, note?`

### Ricezione merce

**GoodsReceipt** — `receiptNumber String @unique` (da `DocumentSequence`), `supplierId → Supplier, purchaseOrderId → PurchaseOrder, receivedAt DateTime, warehouseId → Warehouse, notes?, status GoodsReceiptStatus` (`DRAFT | CONFIRMED | CANCELLED`)

**GoodsReceiptLine** — `goodsReceiptId → GoodsReceipt, purchaseOrderLineId → PurchaseOrderLine, productId → Product, declaredQty Decimal, receivedQty Decimal, acceptedQty Decimal, rejectedQty Decimal, damagedQty Decimal, lotNumber?, productionDate?, expirationDate?, warehouseLocation?`

**DeliveryNote (DDT)** — `ddtNumber, ddtDate DateTime, supplierId → Supplier, purchaseOrderId → PurchaseOrder, goodsReceiptId → GoodsReceipt?, carrier?, trackingNumber?, packageCount Int?, weightKg Decimal?, attachmentId → FileAttachment?, notes?`
> Un ordine può avere più DDT; un DDT più prodotti dello stesso ordine (§7 del PDF). Relazione DDT↔più-ordini esplicitamente rimandata al futuro — schema pronto (basta rendere `purchaseOrderId` opzionale il giorno in cui serve), non costruita ora.

### Magazzino (ledger)

**StockMovement** *(aggiunta — il "ledger" richiesto esplicitamente al §8 del PDF)* — append-only
- `productId → Product, warehouseId → Warehouse, quantity Decimal` (con segno: positivo=carico, negativo=scarico), `movementType String` (`RECEIPT | SALE | ADJUSTMENT | TRANSFER_IN | TRANSFER_OUT | RETURN`), `sourceType String, sourceId String` (riferimento polimorfico al documento che ha generato il movimento — es. `GOODS_RECEIPT` + id), `inventoryLotId → InventoryLot?, movementDate DateTime, createdAt DateTime @default(now())`
- `@@unique([sourceType, sourceId, productId])` — **questo è il vincolo che rende idempotente la conferma di una Goods Receipt** (§8 esplicito: "non deve essere possibile caricare due volte lo stesso documento").
- La giacenza di un prodotto in un magazzino è sempre `SUM(quantity) WHERE productId, warehouseId` — mai un campo `stock` scritto direttamente (stesso principio già applicato al saldo banca, §23).

**InventoryLot** — `productId → Product, supplierId → Supplier, purchaseOrderId → PurchaseOrder, goodsReceiptId → GoodsReceipt, lotNumber, productionDate?, expirationDate?, originalQuantity Decimal, remainingQuantity Decimal` (cache derivata, ricalcolabile da `StockMovement` filtrati per `inventoryLotId` — non fonte di verità autonoma), `purchaseUnitCost Decimal, landedUnitCost Decimal, currency, receivedAt DateTime`

### Fatture fornitore e scadenze

**SupplierInvoice** — `invoiceNumber, supplierId → Supplier, invoiceDate DateTime, receivedDate DateTime, purchaseOrderId → PurchaseOrder?, currency, taxableAmount Decimal, taxAmount Decimal, totalAmount Decimal, paymentTermId → PaymentTerm, dueDate DateTime?, status SupplierInvoiceStatus, attachmentId → FileAttachment?, notes?`
- `@@unique([supplierId, invoiceNumber, fiscalYear])` (`fiscalYear Int` derivato da `invoiceDate`, salvato per poter indicizzare/vincolare) — impedisce duplicazione, come richiesto esplicitamente.

**SupplierInvoiceLine** — `supplierInvoiceId → SupplierInvoice, purchaseOrderLineId → PurchaseOrderLine?, description, quantity Decimal, unitPrice Decimal, taxableAmount Decimal, vatAmount Decimal, totalAmount Decimal`

**PaymentDeadline** — `supplierInvoiceId → SupplierInvoice, installmentNumber Int, originalAmount Decimal` (**mai modificato dopo la creazione** — §21 esplicito), `remainingAmount Decimal, dueDate DateTime, paymentMethod PurchasePaymentMethod, bankAccountId → BankAccount?, status PaymentDeadlineStatus, presentedAt DateTime?, note?`

**Riba** — `paymentDeadlineId → PaymentDeadline, supplierId → Supplier, amount Decimal, dueDate DateTime, debitBankAccountId → BankAccount, status RibaStatus, expectedDate DateTime?, actualDate DateTime?, bankFee Decimal?, batchNumber?, note?`

### Movimenti finanziari

**Payment** — `supplierId → Supplier, supplierInvoiceId → SupplierInvoice, paymentDeadlineId → PaymentDeadline, bankAccountId → BankAccount, paymentDate DateTime, valueDate DateTime, amount Decimal, paymentMethod PurchasePaymentMethod, bankFee Decimal?, transactionReference?, notes?, reversedById → Payment?` (self-relation — uno storno è un nuovo `Payment` negativo collegato, mai una cancellazione — §29/§39 esplicito)

**CashJournalEntry (Prima Nota)** — `entryNumber String @unique` (da `DocumentSequence`), `entryDate DateTime, valueDate DateTime, entryType String` (`INCOME | EXPENSE | TRANSFER | SUPPLIER_PAYMENT | CUSTOMER_RECEIPT | BANK_FEE | REFUND | TAX | PAYROLL | COST | REVENUE | ADJUSTMENT`), `bankAccountId → BankAccount, counterparty, description, category, amount Decimal, direction String` (`DEBIT | CREDIT` — evita l'ambiguità "dare/avere vs signed amount" scegliendo esplicitamente **amount sempre positivo + direction**, più semplice da validare e da sommare correttamente rispetto a Decimal con segno misto), `supplierId?, customerId?, supplierInvoiceId?, paymentId → Payment?, paymentDeadlineId?, attachmentId → FileAttachment?, notes?, createdById → User`

**BankLedgerEntry** — movimento sul singolo conto, generato automaticamente da `Payment`/`CashJournalEntry`/`Transfer`, mai scritto a mano — `bankAccountId → BankAccount, amount Decimal, direction String, sourceType, sourceId, entryDate DateTime` — il **saldo banca è sempre `openingBalance + SUM(entries firmate per direction)`**, mai un campo modificabile (§23 esplicito).

**Transfer** (giroconto) — `fromBankAccountId → BankAccount, toBankAccountId → BankAccount, amount Decimal, transferDate DateTime, fee Decimal?, reference?` — genera due `BankLedgerEntry` collegati, **mai** una `CashJournalEntry` di tipo costo (§22 esplicito: non è una spesa).

**BankTransaction** *(predisposizione schema, nessuna integrazione bancaria reale ora — §24 esplicito)* — `bankAccountId → BankAccount, transactionDate DateTime, amount Decimal, description, matchStatus String` (`UNMATCHED | SUGGESTED_MATCH | MATCHED | IGNORED`), `matchedEntryId → BankLedgerEntry?`

### Trasversali

**FileAttachment** — `fileName, mimeType, sizeBytes Int, storageKey String` (path/URL nel backend di storage scelto — vedi §11), `uploadedById → User, createdAt DateTime`

**PurchasingAuditLog** *(nuovo, non riuso di `AuditLog` — vedi §1)* — `actorId → User, entityType String, entityId String, action String, previousValues Json?, newValues Json?, reason String?, createdAt DateTime` — `@@index([entityType, entityId])`

**DocumentSequence** *(aggiunta — numerazione atomica)* — `documentType String, year Int, lastValue Int` — `@@unique([documentType, year])`. Incremento via `UPDATE ... SET "lastValue" = "lastValue" + 1 WHERE ... RETURNING "lastValue"` dentro la transazione che crea il documento — atomico per costruzione in Postgres, nessun lock esplicito necessario.

## 4. Workflow completo

Due catene, come distinte esplicitamente dalla spec (**Logistic Status** vs **Financial Status**, mai confuse):

```
FORNITORE
  → PurchaseOrder (DRAFT → SENT → CONFIRMED → IN_PRODUCTION → READY → PARTIALLY_SHIPPED/SHIPPED)
  → GoodsReceipt (una o più, parziali) → DeliveryNote (DDT, una o più)
  → conferma GoodsReceipt → StockMovement (RECEIPT) → InventoryLot creato/aggiornato
  → PurchaseOrder.logisticStatus → PARTIALLY_RECEIVED / RECEIVED
  → SupplierInvoice registrata → matching vs Ordine/DDT (§13, solo segnalazione anomalie, nessuna modifica automatica al PO)
  → PaymentDeadline generate da PaymentTerm (§15)
  → Riba/Bonifico/Altro → Payment → CashJournalEntry + BankLedgerEntry
  → PurchaseOrder.financialStatus → OPEN → ... → COMPLETED (indipendente dal logistico)
  → checklist chiusura (§11 del PDF) → PurchaseOrder.logisticStatus = COMPLETED quando tutte le condizioni sono vere
```

Ogni passaggio scrive `PurchaseOrderStatusHistory` (per il PO) o `PurchasingAuditLog` (per tutto il resto) — nessun passaggio silenzioso.

## 5. Stati

### PurchaseOrder — `logisticStatus` (macchina a stati, transizioni validate server-side)

```
DRAFT → SENT → CONFIRMED → IN_PRODUCTION → READY → PARTIALLY_SHIPPED → SHIPPED
                                                            ↓                ↓
                                                  PARTIALLY_RECEIVED ← ← ← ←
                                                            ↓
                                                        RECEIVED
                                                            ↓
                                                        COMPLETED

Da qualunque stato precedente COMPLETED → CANCELLED (transizione eccezionale, sempre permessa finché non COMPLETED)
```
Transizioni **non lineari esplicitamente vietate**: non si può passare da `DRAFT` a `RECEIVED` saltando gli stati intermedi; la tabella delle transizioni ammesse vive in un modulo puro (`purchase-order-state-machine.ts`), stessa idea di una whitelist `Map<CurrentState, Set<AllowedNextState>>`, testabile senza DB.

`financialStatus` (indipendente): `OPEN → PARTIALLY_INVOICED → INVOICED → PARTIALLY_PAID → PAID` — non blocca né è bloccato dal `logisticStatus`.

### SupplierInvoice — `status`
```
DRAFT → REGISTERED → PARTIALLY_PAID → PAID
                 ↘ CANCELLED (solo se nessun Payment collegato — altrimenti storno, §29)
```

### GoodsReceipt — `status`: `DRAFT → CONFIRMED` (irreversibile — una volta `CONFIRMED` genera `StockMovement`, correzioni solo via nuovo movimento di rettifica, mai modifica in place) `→ CANCELLED` (solo da `DRAFT`).

### PaymentDeadline — `status`: `OPEN → SCHEDULED → PRESENTED → PARTIALLY_PAID → PAID`, con `OVERDUE` derivato a runtime (`dueDate < oggi AND status NOT IN (PAID, CANCELLED)`) — **non è uno stato persistito**, è calcolato in ogni query/vista, così non richiede un job che lo tenga aggiornato e non rischia di restare stantio. `CANCELLED`, `DISPUTED` restano stati persistiti a sé.

### Riba — `status`: `TO_PRESENT → PRESENTED → ACCEPTED → PAID`, oppure `REJECTED`/`CANCELLED` da `PRESENTED`.

## 6. Regole contabili (invarianti — da aggiungere a `CLAUDE.md`, §39 del PDF)

Le 15 invarianti elencate nel PDF sono corrette e coerenti con i principi non negoziabili già in `CLAUDE.md` (in particolare #11 "nessun dato economico sovrascritto senza storico" e #12 "nessun saldo di magazzino modificato direttamente"). Le adotto integralmente, con due aggiunte per coerenza con l'ERD sopra:

16. Ogni numerazione documentale (PO, ricezione, fattura interna, prima nota) passa da `DocumentSequence`, mai da `MAX(id)+1` o logica client-side.
17. `StockMovement` è l'unica fonte di verità per la giacenza; `InventoryLot.remainingQuantity` è una cache ricalcolabile, mai autorevole in caso di divergenza.

## 7. Strategia COGS / Landed Cost

Distinzione esplicita (§9 del PDF, adottata integralmente):

```
Purchase Price   → prezzo di listino/negoziato per unità (SupplierProduct/PurchaseOrderLine)
Purchase Cost    → Purchase Price × quantità, prima dei costi accessori
Landed Cost      → Purchase Cost + costi accessori allocati (trasporto, dogana, packaging, ...)
Inventory Cost   → Landed Cost per unità, valore a cui il lotto entra a magazzino (InventoryLot.landedUnitCost)
COGS             → riconosciuto SOLO alla vendita, mai all'acquisto
```

Algoritmo di allocazione costi accessori (default `BY_QUANTITY`, come da esempio nel PDF):
```
landedCost = Σ(righe ordine, prezzo×quantità) + Σ(PurchaseCost.amount)
landedUnitCost = landedCost / Σ(quantità ricevuta)
```
Conservati sempre separatamente su `InventoryLot`: `purchaseUnitCost` (solo merce) e `landedUnitCost` (merce + accessori) — mai solo il risultato finale, come richiesto esplicitamente.

Valorizzazione a consumo: **Weighted Average** per la prima versione (nessun metodo preesistente nel progetto da preservare — il sistema COGS Amazon attuale non è un ledger a lotti, è un valore corrente per ASIN). FIFO/lotto specifico restano un'estensione futura esplicitamente prevista dallo schema (`InventoryLot` è già per-lotto).

## 8. Scadenzario

Generazione automatica alla registrazione fattura (§15): per ogni `PaymentTermInstallmentRule` del `PaymentTerm` collegato, una `PaymentDeadline` con `originalAmount = round(totalAmount × percentage / 100, 2)`; la differenza di arrotondamento (somma rate − totale fattura) va sempre sull'**ultima rata**, garantendo `Σ PaymentDeadline.originalAmount === SupplierInvoice.totalAmount` esatto.

Vista principale (`Amministrazione > Scadenzario`), default **per mese**, con i filtri elencati nel PDF (mese, anno, fornitore, cliente, tipo, metodo, banca, stato, scaduto/non scaduto, importo, categoria) — nessun filtro `organization` (non esiste il concetto, vedi §11). Viste richieste: mensile, lista, calendario, riepilogo annuale — tutte derivate dalla stessa query su `PaymentDeadline`, nessuna tabella duplicata.

## 9. Prima Nota

`CashJournalEntry` con `amount` sempre positivo + `direction` (`DEBIT`/`CREDIT`) invece di dare/avere separati o importi con segno misto — scelta esplicita per eliminare l'ambiguità "un importo negativo è un'entrata invertita o un'uscita?" che la spec stessa segnala come rischio (§19: "il modello deve evitare ambiguità contabili"). Ogni riga generata da un `Payment` o da un `Transfer` è collegata (`paymentId`/riferimenti opzionali) — mai una prima nota scollegata dal documento che l'ha originata quando quel documento esiste.

## 10. Banche

`BankAccount.openingBalance` + `BankLedgerEntry` (mai un campo saldo scrivibile) = saldo gestionale. Riconciliazione futura (`BankTransaction`, §24) predisposta nello schema ma non implementata in questa fase — coerente con quanto la spec stessa richiede ("non implementare necessariamente integrazione bancaria ora, ma il database deve essere predisposto").

## 11. Decisioni che richiedono conferma esplicita prima di FASE B

Punti dove la spec fornita assume qualcosa che lo stato reale del progetto non ha, o dove serve una scelta che non era già decisa altrove:

1. **`organizationId` su `PurchaseOrder`**: propongo di **ometterlo** — nessun modello `Organization` esiste, aggiungerlo solo qui creerebbe un campo che punta a niente. Se in futuro arriva un vero multi-tenant, si aggiunge allora su tutte le entità insieme (non "di nascosto" qui). **Da confermare.**
2. **RBAC (§35)**: `User.role` oggi è una stringa usata da middleware auth già testati (`"master"|"admin"|"user"`). Propongo un campo **separato** `User.purchasingRole String?` (`ADMIN|MANAGEMENT|PURCHASING|WAREHOUSE|ACCOUNTING|READ_ONLY`) invece di riusare/estendere `role`, per non rischiare regressioni sull'auth esistente. **Da confermare.**
3. **File storage**: nessun backend di storage esiste oggi (nessun S3/multer/disco configurato). `FileAttachment` definisce solo lo schema; l'endpoint di upload reale (locale in dev, S3-compatibile in prod) va deciso quando si arriva a FASE E (DDT) o G (fatture) — prima vera dipendenza esterna nuova del progetto. **Da discutere quando ci arriviamo, non ora.**
4. **Riconciliazione con COGS Amazon esistente**: questo modulo crea un COGS "vero" da acquisti reali; il sistema `AmazonProductCogs` esistente resta invariato e continua ad alimentare il P&L Amazon come oggi. Nessuna unificazione automatica proposta in questa fase.

## 12. Branch

Le 13 branch della spec, confermate nell'ordine indicato (§FASE A-O, mappate 1:1):

```
docs/purchasing-erp-architecture   ← QUESTO documento (nessun codice)
feature/master-data                ← FASE B (Warehouse, PaymentTerm, BankAccount base)
feature/supplier-management        ← FASE C (Supplier, SupplierContact, SupplierProduct + storico prezzi)
feature/purchase-orders            ← FASE D (PurchaseOrder + righe + stati + DocumentSequence)
feature/goods-receipts-ddt         ← FASE E (GoodsReceipt + DeliveryNote + FileAttachment base)
feature/purchase-order-cogs        ← FASE F (StockMovement + InventoryLot + Landed Cost)
feature/supplier-invoices          ← FASE G (SupplierInvoice + matching Ordine/DDT/Fattura)
feature/payment-terms              ← FASE H (PaymentTermInstallmentRule + algoritmo scadenze)
feature/deadline-schedule          ← FASE I (PaymentDeadline + Scadenzario UI)
feature/riba-management            ← FASE J (Riba)
feature/bank-accounts              ← FASE K (BankAccount UI + BankLedgerEntry)
feature/cash-journal               ← FASE L (CashJournalEntry + Transfer)
feature/payment-reconciliation     ← FASE M (Payment + reversal + transazione atomica end-to-end)
feature/purchasing-dashboard       ← FASE N (KPI acquisti)
                                    ← FASE O (test E2E completo, non branch a sé — attraversa tutte)
```

Ogni branch: spec dedicata (se introduce decisioni non banali) → piano (`writing-plans`) → implementazione TDD → migrazione+rollback se tocca schema → PR verso `develop`. Stesso processo già seguito per il profit-engine in questa sessione.

## 13. Roadmap

FASE A (questo documento) → B → C → D → E → F → G → H → I → J → K → L → M → N → O, **nell'ordine dato**, perché ogni fase dipende strutturalmente dalla precedente (non si può ricevere merce senza un ordine, non si può generare una scadenza senza una fattura, non si può pagare senza una scadenza). Nessuna fase parte prima che la precedente sia verde (test + lint + typecheck + build), come richiesto esplicitamente.

## 14. Rischi

- **Dimensione**: 15 fasi, ~26 entità nuove, 4 macchine a stati (PO, fattura, ricezione, scadenza/Riba). È il lavoro più esteso mai pianificato su questo repository — la disciplina "una branch, un obiettivo, verde prima di andare avanti" non è opzionale qui, è l'unica cosa che rende il progetto gestibile.
- **Concorrenza su documenti numerati**: `DocumentSequence` con `UPDATE...RETURNING` è atomico in Postgres per costruzione, ma va verificato con un test di concorrenza reale (richiesta esplicita §36 — "doppio click/doppia chiamata").
- **Transazioni lunghe**: il flusso pagamento (§20, 5 passaggi in una transazione) rischia lock prolungati se una delle 5 scritture è lenta — da profilare quando si arriva a FASE M, non un problema da risolvere ora.
- **Interazione con `AmazonInventory`**: due concetti di "magazzino" (Amazon sync vs ledger interno) coesistono senza riconciliazione — rischio di confusione utente in UI se non etichettati chiaramente come fonti distinte. Da tenere presente nel design frontend di FASE F/N.
- **File storage**: dipendenza esterna nuova (nessun precedente nel progetto) — introduce superficie di rischio sicurezza (upload non validati, path traversal) quando si arriva a implementarla — richiederà revisione dedicata (`security-reviewer`).

## 15. File da creare/modificare (solo per FASE A — nessun altro file toccato ora)

- **Creato**: `docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md` (questo documento).
- **Da fare in FASE B in poi** (non ora): `backend/prisma/schema.prisma` (26 modelli + 1 migrazione per fase), `backend/src/repositories/purchasing/**`, `backend/src/purchasing/**`, `frontend/src/app/acquisti/**`, `frontend/src/app/anagrafiche/**`, `frontend/src/app/amministrazione/**`, `docs/modules/*.md` (12 file, uno per sotto-modulo, come richiesto §38), aggiornamento `CLAUDE.md` con le 17 invarianti (§6 sopra).

## 16. Prossimo step

Fermo qui, come richiesto. Non ho scritto schema, migrazioni o codice.

Serve la tua conferma su:
1. Le 4 decisioni aperte in §11 (in particolare `organizationId` e RBAC — cambiano i campi di più entità a valle).
2. Se questo ERD/architettura ti torna, o se qualche entità/relazione va rivista prima di procedere.

Una volta confermato, il passo successivo è il brainstorming dedicato di **FASE B (Anagrafiche: Warehouse, PaymentTerm, BankAccount base)** — la prima fase con codice reale — seguito da `writing-plans` per trasformarla in un piano eseguibile, stesso processo già seguito per il profit-engine in questa sessione.
