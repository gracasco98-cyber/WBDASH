# Fatture Fornitore — Design

Data: 2026-09-08
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: FASE G della catena acquisti (ordine → DDT → scadenzario → **fatture fornitore** → prima nota → banche). Oggi è solo una voce "Prossimamente" in `GlobalSidebar.tsx` e una `ComingSoonKpiTile` in `acquisti/page.tsx`; `PurchaseOrderFinancialStatus` ha già gli stati `PARTIALLY_INVOICED`/`INVOICED` commentati come "not reachable yet — FASE G".

---

## 1. Obiettivo

Un registro delle fatture ricevute dai fornitori: inserimento manuale (numero, data, importo, IVA), collegamento **opzionale** a un ordine d'acquisto esistente, aggiornamento automatico dello stato "fatturato" dell'ordine collegato. Niente automazione di scarico da SDI/Agenzia delle Entrate in questa fase — solo un campo che lascia la porta aperta per quando arriverà.

## 2. Cosa NON fa questa fase

- **Nessuna integrazione SDI/Agenzia delle Entrate**: `source` distingue già `MANUAL`/`SDI` a livello di schema, ma solo `MANUAL` è raggiungibile da questa fase — nessun parser XML, nessuna chiamata esterna.
- **Nessun collegamento allo scadenzario**: `SupplierPaymentDue` continua a nascere da `createGoodsReceipt()` (`goods-receipts.repo.ts`), non dalla fattura — deciso esplicitamente con l'utente.
- **Nessun upload PDF/allegato**: solo dati numerici, come lo scadenzario.
- **Nessuna cancellazione reale**: una fattura si "annulla" (soft-void, `voidedAt`), mai `DELETE` — documento fiscale, storico da conservare (principio CLAUDE.md §11/§16).
- **Nessuna fattura multi-ordine**: un collegamento opzionale a **un solo** `PurchaseOrder` (deciso con l'utente — copre sia le fatture legate a un PO sia quelle di servizi/spese varie senza PO).

## 3. Nuova entità

```prisma
enum SupplierInvoiceSource {
  MANUAL
  SDI // riservato per la futura integrazione Agenzia delle Entrate/SDI — non implementato in questa fase
}

model SupplierInvoice {
  id              String                 @id @default(cuid())
  invoiceNumber   String                 // numero fattura del fornitore — non univoco globalmente, fornitori diversi possono riusare numerazioni
  supplierId      String
  supplier        Supplier               @relation(fields: [supplierId], references: [id])
  purchaseOrderId String?
  purchaseOrder   PurchaseOrder?         @relation(fields: [purchaseOrderId], references: [id])
  invoiceDate     DateTime
  receivedDate    DateTime               @default(now())
  taxableAmount   Decimal                @db.Decimal(14, 4)
  vatAmount       Decimal                @db.Decimal(14, 4)
  totalAmount     Decimal                @db.Decimal(14, 4)
  currency        String                 @default("EUR")
  source          SupplierInvoiceSource  @default(MANUAL)
  notes           String?
  voidedAt        DateTime?
  createdById     String
  createdBy       User                   @relation(fields: [createdById], references: [id])
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  @@unique([supplierId, invoiceNumber])
  @@index([supplierId])
  @@index([purchaseOrderId])
}
```

Back-relation da aggiungere: `Supplier.supplierInvoices SupplierInvoice[]`, `PurchaseOrder.supplierInvoices SupplierInvoice[]`, `User.supplierInvoicesCreated SupplierInvoice[]` (stesso stile di `purchaseOrdersAsBuyer`).

`taxableAmount`/`vatAmount`/`totalAmount` arrivano già calcolati dal chiamante (stesso pattern di `PurchaseOrderLine` — il repository non ricalcola nulla, si fida dell'input; la UI calcola `totalAmount = taxableAmount + vatAmount` come comodità, non come vincolo server-side).

## 4. Effetto collaterale su `PurchaseOrder.financialStatus`

Solo quando `purchaseOrderId` è valorizzato. Dentro la stessa transazione di creazione/annullamento fattura:

1. Somma `PurchaseOrderLine.totalAmount` di tutte le righe dell'ordine → `orderTotal`.
2. Somma `SupplierInvoice.totalAmount` di tutte le fatture **non annullate** collegate a quell'ordine (dopo la scrittura corrente) → `invoicedTotal`.
3. `invoicedTotal <= 0` → `OPEN`; `invoicedTotal >= orderTotal` → `INVOICED`; altrimenti → `PARTIALLY_INVOICED`.

Nessuna tabella di storico per queste transizioni (a differenza di `PurchaseOrderStatusHistory`, che è tipizzata solo su `PurchaseOrderLogisticStatus`) — fuori scope per questa fase, si aggiunge se servirà davvero.

## 5. Componenti

- **`backend/src/repositories/purchasing/supplier-invoices.repo.ts`** (nuovo):
  - `createSupplierInvoice(prisma, input, createdById)` — `createdById` è sempre `req.user!.id` della sessione autenticata (mai un campo lato client, stesso pattern di `buyerId` in `purchase-orders.routes.ts`). Transazione: crea la riga, poi ricalcola `financialStatus` dell'ordine collegato (§4) se presente.
  - `findAllSupplierInvoices(prisma, filters?: { supplierId?, purchaseOrderId?, includeVoided? })` — `includeVoided` di default `false`: la lista mostra solo fatture attive a meno che non venga richiesto esplicitamente di includere anche le annullate. Join su fornitore (`legalName`) e ordine (`poNumber`), ordinate per `invoiceDate desc`.
  - `findSupplierInvoiceById(prisma, id)`.
  - `voidSupplierInvoice(prisma, id)` — transazione: imposta `voidedAt = now()`, ricalcola `financialStatus` dell'ordine collegato se presente. Idempotente-safe: annullare una fattura già annullata è un no-op (non un errore), lo stato "annullata" è terminale.
- **`backend/src/purchasing/routes/supplier-invoices.routes.ts`** (nuovo), montato su `/api/purchasing` come gli altri:
  - `GET /supplier-invoices` — lista + filtri querystring.
  - `GET /supplier-invoices/:id`.
  - `POST /supplier-invoices` — crea (400 se manca `supplierId`/`invoiceNumber`/`invoiceDate`/importi; 409 se viola `@@unique([supplierId, invoiceNumber])`, mappando `P2002`).
  - `POST /supplier-invoices/:id/void`.
- **`frontend/src/lib/api/supplier-invoices.ts`** (nuovo) — client tipizzato, stesso stile di `payment-dues.ts`.
- **Frontend**:
  - `frontend/src/app/acquisti/fatture/page.tsx` — elenco, filtro fornitore/ordine, badge "Annullata" sulle fatture con `voidedAt`, bottone "Nuova fattura".
  - `frontend/src/app/acquisti/fatture/nuovo/page.tsx` — form: fornitore (select, obbligatorio), ordine collegato (select opzionale, filtrato per fornitore scelto), numero fattura, data fattura, imponibile, IVA (totale calcolato in automatico, editabile), note.
  - `frontend/src/app/acquisti/fatture/[id]/page.tsx` — dettaglio + azione "Annulla fattura" (conferma semplice, non distruttiva come nello scadenzario — non è una `DELETE`).
- **Attivazione**: `GlobalSidebar.tsx` — `{ label: "Fatture Fornitore", comingSoon: true }` → `{ href: "/acquisti/fatture", label: "Fatture Fornitore" }`. La `ComingSoonKpiTile` "Fatture da riconciliare" in `acquisti/page.tsx` **resta com'è**: quella è competenza della riconciliazione pagamenti (FASE M), un deliverable diverso da questo registro.

## 6. Rischi

- **Race su `@@unique([supplierId, invoiceNumber])` sotto concorrenza**: mappare `P2002` a 409 nella route, non lasciare che diventi un 500 generico.
- **Doppio annullamento**: `voidSupplierInvoice` deve essere un no-op se `voidedAt` è già valorizzato, per evitare di ricalcolare due volte `financialStatus` con lo stesso identico stato.
- **Ordine collegato cambia dopo la fattura**: fuori scope — non è previsto un endpoint per modificare `purchaseOrderId` di una fattura esistente; per correggere un collegamento errato si annulla e se ne crea una nuova.

## 7. Test

- **`backend/tests/repositories/purchasing/supplier-invoices.repo.test.ts`**: creazione senza ordine collegato (financialStatus invariato), con ordine (transizioni OPEN→PARTIALLY_INVOICED→INVOICED su più fatture parziali), annullamento che fa retrocedere lo stato, doppio annullamento no-op, violazione unique constraint.
- **`backend/tests/integration/purchasing-supplier-invoices.test.ts`**: round-trip HTTP delle route (200/400/404/409), filtri della lista.
- **Frontend**: test dei tre componenti pagina (elenco, form, dettaglio) nello stile già usato per `acquisti/scadenzario/page.test.tsx`.

## 8. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans`.
