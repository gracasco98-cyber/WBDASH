# Scadenzario fornitori — Design

Data: 2026-08-24
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: continuazione della catena acquisti → ordine → DDT → **scadenzario** → prima nota → banche, concordata a inizio progetto. Fatture Fornitore non esiste ancora — le scadenze nascono dall'ordine stesso (decisione esplicita, vedi §2).

---

## 1. Obiettivo

Generare e tracciare le scadenze di pagamento verso i fornitori, derivate automaticamente dagli ordini di acquisto una volta ricevuta la merce, usando le condizioni di pagamento già assegnate all'ordine (FASE C, mai finora usate in un calcolo reale).

## 2. Trigger e ancora temporale

Le scadenze si generano **automaticamente** quando un ordine raggiunge lo stato `RECEIVED` — dentro la stessa transazione di `createGoodsReceipt()` (`backend/src/repositories/purchasing/goods-receipts.repo.ts`), non un job/cron separato. Nessuna rigenerazione: `RECEIVED` non ha transizioni in uscita nella state machine (FASE E1), quindi il trigger scatta esattamente una volta per ordine.

Data di ancora: la `receiptDate` dell'ultimo DDT che porta l'ordine a `RECEIVED` (non la data dell'ordine, non la data del primo DDT se l'ordine ha ricezioni parziali).

Quando in futuro esisterà il modulo Fatture Fornitore, l'ancora si sposterà sulla data fattura — non è un problema di questa fase, il calcolo resta isolato in una funzione dedicata (§4) facile da ripuntare più avanti.

## 3. Calcolo della data di scadenza per rata

Ogni `PaymentTermInstallmentRule` (numero rata, `offsetDays`, percentuale) genera una riga di scadenza. Algoritmo, nell'ordine:

1. **Fine mese** (`PaymentTerm.endOfMonth`): se attivo, la data di ancora si arrotonda all'ultimo giorno di quel mese. Altrimenti resta invariata.
2. **Giorni** (`offsetDays` della rata): si sommano alla data (eventualmente arrotondata) del passo 1.
3. **Giorno fisso** (`PaymentTerm.fixedDay`): se impostato, la data del passo 2 si sposta al `fixedDay` del **mese successivo** a quello in cui cade — mai lo stesso mese, anche se `fixedDay` sarebbe già successivo al giorno del passo 2. Se non impostato, la data del passo 2 è quella finale.

Esempio di validazione (concordato con l'utente): ricezione 5 marzo, 30gg, fine mese attivo, giorno fisso 10 → 31 marzo (fine mese) → 30 aprile (+30gg) → **10 maggio** (giorno fisso del mese successivo ad aprile).

L'importo di ogni rata è `percentage / 100 * totalAmount dell'ordine` (somma di `PurchaseOrderLine.totalAmount` su tutte le righe — un'unica condizione di pagamento vale per l'intero ordine, non per riga).

## 4. Nuova entità e componenti

```prisma
enum SupplierPaymentDueStatus {
  PENDING
  PAID
}

model SupplierPaymentDue {
  id                 String                    @id @default(cuid())
  purchaseOrderId    String
  purchaseOrder      PurchaseOrder             @relation(fields: [purchaseOrderId], references: [id])
  installmentNumber  Int
  dueDate            DateTime
  amount             Decimal                   @db.Decimal(14, 4)
  status             SupplierPaymentDueStatus  @default(PENDING)
  paidDate           DateTime?
  paidAmount         Decimal?                  @db.Decimal(14, 4)
  createdAt          DateTime                  @default(now())
  updatedAt          DateTime                  @updatedAt

  @@index([purchaseOrderId])
  @@index([status])
  @@index([dueDate])
}
```

- **`backend/src/purchasing/payment-schedule.ts`** (nuovo, pure function, no Prisma) — `computeDueDate(anchorDate, endOfMonth, fixedDay, offsetDays): Date` (l'algoritmo §3) e `computePaymentSchedule(anchorDate, paymentTerm, totalAmount): { installmentNumber, dueDate, amount }[]`. Isolata e testabile senza database, stesso principio di `purchase-order-state-machine.ts`.
- **`backend/src/repositories/purchasing/goods-receipts.repo.ts`** (modifica) — quando `createGoodsReceipt()` porta l'ordine a `RECEIVED`, dentro la stessa transazione: legge il `PaymentTerm` (con le sue `installments`) dell'ordine, chiama `computePaymentSchedule()`, crea le righe `SupplierPaymentDue`.
- **`backend/src/repositories/purchasing/payment-dues.repo.ts`** (nuovo) — `findAllPaymentDues()` (con filtri fornitore/stato, join su ordine→fornitore per il nome), `markPaymentDuePaid(id, paidDate, paidAmount)`.
- **`backend/src/purchasing/routes/payment-dues.routes.ts`** (nuovo) — `GET /payment-dues` (lista + filtri), `POST /payment-dues/:id/mark-paid`.
- **Frontend**: nuova pagina `frontend/src/app/acquisti/scadenzario/page.tsx` — tabella di tutte le scadenze, ordinata per data, scadute evidenziate in rosso, filtro per fornitore/stato, azione "Segna come pagato" (conferma semplice, non la conferma testuale usata per l'eliminazione ordini — l'azione non è distruttiva). Per semplicità questa fase non prevede un endpoint di "annulla pagamento": una volta segnata pagata, una scadenza non può tornare "da pagare" dalla UI — si aggiunge in futuro se serve davvero. Sidebar: la voce "Scadenzario" (oggi "Prossimamente" in `GlobalSidebar.tsx`) diventa un link reale.

## 5. Cosa NON fa questa fase

- Nessun collegamento a Prima Nota (non esiste ancora) — "segna come pagato" è solo un flag manuale con data/importo, non genera un movimento contabile.
- Nessuna modifica a `PurchaseOrder.financialStatus` (resta `OPEN` come oggi — quel campo è competenza di FASE G, Fatture Fornitore).
- Nessuna notifica/promemoria per scadenze imminenti — solo visualizzazione nella pagina dedicata.
- Nessuna gestione di scadenze parziali (pagamento parziale di una rata) — lo stato è binario Da pagare/Pagato.

## 6. Rischi

- **Algoritmo data-scadenza non banale**: `computePaymentSchedule()` va isolata e testata a fondo (casi: senza fine mese né giorno fisso, solo fine mese, solo giorno fisso, entrambi, più rate con `offsetDays` diversi) prima di collegarla a `createGoodsReceipt()`.
- **Percentuali che non sommano esattamente a 100%**: già validato in scrittura da `createPaymentTerm()` (tolleranza 0.01), quindi gli importi delle rate dovrebbero sempre sommare al totale ordine entro un centesimo — da verificare con un test dedicato (somma rate ≈ totale ordine).
- **Ordine senza `PaymentTerm` valorizzato**: non può succedere — `paymentTermId` è obbligatorio su `PurchaseOrder` fin da FASE D.

## 7. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans`.
