# Anagrafiche acquisti — Fondamenta (Parte 1) — Design

Data: 2026-08-25
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: l'utente ha segnalato che le pagine Magazzini, Banche e Condizioni di pagamento (`frontend/src/app/acquisti/magazzini`, `.../banche`, `.../condizioni-pagamento`, componenti `MagazziniTab.tsx`/`BancheTab.tsx`/`CondizioniPagamentoTab.tsx`) sono tabelle di sola lettura: in alcuni casi non è possibile creare una banca o una condizione di pagamento dall'interfaccia, pur esistendo già gran parte del CRUD lato backend. Richiesta esplicita: rendere queste aree "dinamiche, user friendly, concatenate" — non semplici form meccanici. Il progetto è stato diviso in due parti (concordato in sessione): questa spec copre la **Parte 1 — Fondamenta** (i form completi e le basi per i collegamenti). La **Parte 2 — Collegamento** (quick-create al volo nei form Fornitore/Ordine, collegamento Banche↔Scadenzario) è una spec separata successiva, che si appoggia su quanto costruito qui.

---

## 1. Obiettivo

Portare Magazzini, Banche e Condizioni di pagamento da tabelle di sola lettura a pagine con CRUD completo (crea/modifica/disattiva), coerenti con il pattern già in uso per i Fornitori (`SupplierForm.tsx`), e aggiungere due elementi che le rendono utili invece che meccaniche:

1. **Contatori d'uso** su ogni riga di Magazzini e Condizioni di pagamento (quante entità reali le usano), per capire a colpo d'occhio cosa è collegato a qualcosa e cosa si può disattivare in sicurezza.
2. **Anteprima live delle scadenze** nel form Condizioni di pagamento, calcolata con la stessa logica già usata dallo Scadenzario, così chi configura una condizione vede subito l'effetto reale invece di indovinare cosa significano "fine mese"/"giorno fisso"/percentuali.

## 2. Gap confermati (stato attuale)

| Entità | Backend | Frontend |
|---|---|---|
| Warehouse (Magazzini) | CRUD completo: `GET/POST/PUT/DELETE /warehouses` | Solo lista, nessun form crea/modifica |
| BankAccount (Banche) | CRUD completo ma `PUT` aggiorna solo `bankName, alias, accountHolder, bic, accountingCode, notes` (IBAN/valuta/saldo iniziale immutabili per design) | Solo lista, nessun form crea/modifica |
| PaymentTerm (Condizioni pagamento) | Solo `GET/POST/DELETE` — **manca l'endpoint di modifica** | Solo lista, nessun form crea/modifica |

In più, `Supplier.defaultPaymentTermId` esiste già su schema e su `createSupplier`, ma `SupplierForm.tsx` non lo espone: resta un gap, ma è del dominio Fornitore/quick-create → trattato nella Parte 2, non qui.

## 3. Ambito di questa parte

1. Form crea/modifica per Warehouse, BankAccount, PaymentTerm (stile `SupplierForm.tsx`: `Section`/`Field`, `onSubmit` disaccoppiato dalla navigazione).
2. Nuovo endpoint backend `PUT /payment-terms/:id` + `updatePaymentTerm()` nel repository, per chiudere il gap di modifica.
3. Contatori d'uso su Magazzini e Condizioni di pagamento (righe di lista), via `_count` di Prisma sulle relazioni già esistenti nello schema.
4. Anteprima live delle scadenze nel form Condizioni di pagamento, mirror client-side puro di `computeDueDate()`/`computePaymentSchedule()`.

Le Banche **non** ricevono un contatore d'uso in questa parte: `BankAccount` non ha oggi nessuna relazione Prisma verso Supplier/PurchaseOrder (rappresenta i conti correnti aziendali, non quelli dei fornitori — i fornitori hanno `bankName`/`iban`/`bic` come campi liberi propri, senza relazione). Il collegamento reale (`SupplierPaymentDue.paidFromBankAccountId`, valorizzato quando si segna una scadenza come pagata) è la nuova relazione approvata per la Parte 2 — il contatore d'uso per le Banche arriverà con essa, non prima che esista qualcosa da contare.

## 4. Magazzini (Warehouse)

**`frontend/src/components/purchasing/WarehouseForm.tsx`** (nuovo), stesso pattern di `SupplierForm.tsx`:

```ts
export interface WarehouseFormState { name: string; code: string; address: string; }
export const EMPTY_WAREHOUSE_FORM: WarehouseFormState = { name: "", code: "", address: "" };

interface Props {
  initial?: Partial<WarehouseFormState>;
  disableCode?: boolean; // true in modifica: il backend non permette di cambiare `code` (unique, usato altrove come chiave)
  submitLabel: string;
  onSubmit: (data: WarehouseFormState) => Promise<void>;
}
```

Una sola `Section` "Magazzino": `name*`, `code*` (disabilitato in modifica), `address`.

**Pagine**:
- `frontend/src/app/acquisti/magazzini/nuovo/page.tsx` (nuova) — `WarehouseForm` con `submitLabel="Crea magazzino"`, `onSubmit` chiama `api.purchasing.warehouses.create(...)` e poi `router.push("/acquisti/magazzini")`.
- `frontend/src/app/acquisti/magazzini/[id]/page.tsx` (nuova) — carica il magazzino (nessun `GET /warehouses/:id` oggi: si filtra client-side da `list()`, coerente con la scala di questa entità — poche decine di righe al più), `WarehouseForm` con `disableCode`, `submitLabel="Salva modifiche"`, `onSubmit` chiama `api.purchasing.warehouses.update(id, ...)`.
- `MagazziniTab.tsx` (modifica) — bottone "+ Nuovo magazzino" in alto che linka a `nuovo`; ogni riga diventa cliccabile (link a `[id]`) o riceve un bottone "Modifica"; aggiunta colonna "Utilizzo" (§7).

## 5. Banche (BankAccount)

**`frontend/src/components/purchasing/BankAccountForm.tsx`** (nuovo):

```ts
export interface BankAccountFormState {
  bankName: string; alias: string; accountHolder: string; iban: string; bic: string;
  currency: string; openingBalance: string; openingBalanceDate: string;
  accountingCode: string; notes: string;
}
export const EMPTY_BANK_ACCOUNT_FORM: BankAccountFormState = {
  bankName: "", alias: "", accountHolder: "", iban: "", bic: "",
  currency: "EUR", openingBalance: "0", openingBalanceDate: "",
  accountingCode: "", notes: "",
};

interface Props {
  initial?: Partial<BankAccountFormState>;
  disableImmutableFields?: boolean; // true in modifica: iban/currency/openingBalance/openingBalanceDate non sono più modificabili dal backend
  submitLabel: string;
  onSubmit: (data: BankAccountFormState) => Promise<void>;
}
```

Due `Section`:
- "Identificazione": `bankName*`, `alias*`, `accountHolder*`, `iban*` (disabilitato in modifica), `bic`, `currency` (disabilitato in modifica).
- "Saldo iniziale" (disabilitata per intero in modifica, con nota `"Il saldo iniziale non è modificabile dopo la creazione"` sotto il titolo sezione): `openingBalance*`, `openingBalanceDate*`.
- "Altro": `accountingCode`, `notes` — sempre modificabili.

I campi disabilitati restano visibili (non nascosti): l'utente deve vedere IBAN/saldo del conto che sta modificando, solo non può cambiarli da qui — coerente con `disableInternalCode` già usato in `SupplierForm.tsx`.

**Pagine**: stesso schema di Magazzini — `frontend/src/app/acquisti/banche/nuovo/page.tsx` e `.../banche/[id]/page.tsx`; `BancheTab.tsx` riceve bottone "+ Nuovo conto" e righe cliccabili verso `[id]`. Nessuna colonna "Utilizzo" per questa entità (§3).

## 6. Condizioni di pagamento (PaymentTerm)

### 6.1 Backend — nuovo endpoint di modifica

**`backend/src/repositories/purchasing/payment-terms.repo.ts`** (modifica) — nuova funzione, subito dopo `createPaymentTerm`:

```ts
export interface UpdatePaymentTermInput {
  name: string;
  type: string;
  endOfMonth: boolean;
  fixedDay?: number | null;
  paymentMethod: PurchasePaymentMethod;
  installments: { installmentNumber: number; offsetDays: number; percentage: number }[];
}

export async function updatePaymentTerm(
  prisma: PrismaClient,
  id: string,
  data: UpdatePaymentTermInput
): Promise<PaymentTermWithInstallments> {
  const totalPct = data.installments.reduce((s, i) => s + i.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100, got ${totalPct}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.paymentTermInstallmentRule.deleteMany({ where: { paymentTermId: id } });
    return tx.paymentTerm.update({
      where: { id },
      data: {
        name: data.name, type: data.type, endOfMonth: data.endOfMonth,
        fixedDay: data.fixedDay ?? null, paymentMethod: data.paymentMethod,
        installments: { create: data.installments },
      },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
  });
}
```

Le rate vengono sostituite per intero (cancella-e-ricrea in transazione) invece che aggiornate riga per riga: più semplice, evita di dover far combaciare id di rate vecchie/nuove quando l'utente aggiunge o toglie righe nel form, e la stessa transazione garantisce che non si arrivi mai a uno stato con rate parziali salvate. `PaymentTermInstallmentRule` non è referenziata da nessun'altra tabella (`SupplierPaymentDue` punta a `PurchaseOrder`, non alle singole regole di rata — vedi `2026-08-24-scadenzario-design.md` §4), quindi il delete-then-recreate non lascia foreign key orfane.

**`backend/src/purchasing/routes/master-data.routes.ts`** (modifica) — nuova route, stesso stile delle altre:

```ts
masterDataRouter.put("/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    const { name, type, endOfMonth, fixedDay, paymentMethod, installments } = req.body ?? {};
    if (!name || !type || !paymentMethod || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: "name, type, paymentMethod, installments[] required" });
    }
    const term = await updatePaymentTerm(prisma, req.params.id, {
      name, type, endOfMonth: !!endOfMonth, fixedDay: fixedDay ?? null, paymentMethod, installments,
    });
    res.json(term);
  } catch (err) {
    if ((err as any).code === "P2025") return res.status(404).json({ error: "PaymentTerm not found" });
    const message = err instanceof Error ? err.message : String(err);
    if (/sum to 100/.test(message)) return res.status(400).json({ error: message });
    res.status(500).json({ error: message });
  }
});
```

Import di `updatePaymentTerm` aggiunto alla riga di import esistente da `payment-terms.repo`.

### 6.2 Frontend — form con editor di rate e anteprima live

**`frontend/src/lib/payment-schedule.ts`** (nuovo, mirror client-side puro) — stessa logica di `backend/src/purchasing/payment-schedule.ts`, stesso principio già accettato in questo progetto per `NEXT_STATUSES` (`frontend/src/app/acquisti/ordini/[id]/page.tsx`, che mirror-a la state machine backend): funzione pura, piccola, stabile, a basso rischio di disallineamento, testata separatamente lato frontend.

```ts
// lib/payment-schedule.ts — mirror puro di backend/src/purchasing/payment-schedule.ts.
// Stessa logica, stesse regole UTC-only. Se una delle due cambia, aggiornare l'altra.

export function computeDueDate(
  anchorDate: Date,
  endOfMonth: boolean,
  fixedDay: number | null,
  offsetDays: number
): Date {
  let y = anchorDate.getUTCFullYear();
  let m = anchorDate.getUTCMonth();
  let d = anchorDate.getUTCDate();

  if (endOfMonth) {
    const eom = new Date(Date.UTC(y, m + 1, 0));
    y = eom.getUTCFullYear();
    m = eom.getUTCMonth();
    d = eom.getUTCDate();
  }

  const afterOffset = new Date(Date.UTC(y, m, d + offsetDays));

  if (fixedDay !== null) {
    return new Date(Date.UTC(afterOffset.getUTCFullYear(), afterOffset.getUTCMonth() + 1, fixedDay));
  }
  return afterOffset;
}

export interface PreviewInstallment { installmentNumber: number; offsetDays: number; percentage: number; }

export interface ScheduledInstallment { installmentNumber: number; dueDate: Date; amount: number; }

export function computePaymentSchedule(
  anchorDate: Date,
  term: { endOfMonth: boolean; fixedDay: number | null; installments: PreviewInstallment[] },
  totalAmount: number
): ScheduledInstallment[] {
  const sorted = [...term.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const totalCents = Math.round(totalAmount * 100);
  let allocatedCents = 0;

  return sorted.map((inst, i) => {
    const isLast = i === sorted.length - 1;
    const cents = isLast ? totalCents - allocatedCents : Math.round(totalCents * (inst.percentage / 100));
    allocatedCents += cents;
    return {
      installmentNumber: inst.installmentNumber,
      dueDate: computeDueDate(anchorDate, term.endOfMonth, term.fixedDay, inst.offsetDays),
      amount: cents / 100,
    };
  });
}
```

**`frontend/src/components/purchasing/PaymentTermForm.tsx`** (nuovo):

```ts
export interface PaymentTermInstallmentFormRow { installmentNumber: number; offsetDays: string; percentage: string; }

export interface PaymentTermFormState {
  name: string; type: string; endOfMonth: boolean; fixedDay: string;
  paymentMethod: string; installments: PaymentTermInstallmentFormRow[];
}

export const EMPTY_PAYMENT_TERM_FORM: PaymentTermFormState = {
  name: "", type: "", endOfMonth: false, fixedDay: "", paymentMethod: "",
  installments: [{ installmentNumber: 1, offsetDays: "30", percentage: "100" }],
};

interface Props {
  initial?: Partial<PaymentTermFormState>;
  submitLabel: string;
  onSubmit: (data: PaymentTermFormState) => Promise<void>;
}
```

Struttura:
- `Section` "Condizione": `name*`, `type*` (input testo libero, come già `supplierType` in `SupplierForm.tsx` — il campo non è un enum a schema, i valori esistenti sono liberi come `"RIBA"`/`"BONIFICO"`/`"IMMEDIATE"`), `paymentMethod*` (stesso `<select>` `PAYMENT_METHODS` già definito in `SupplierForm.tsx` — costante duplicata localmente, è già così tra `SupplierForm` e il resto del dominio Pagamenti), checkbox `endOfMonth`, `fixedDay` (number, opzionale).
- `Section` "Rate": editor a righe. Per ogni riga di `installments`: `offsetDays` (number) e `percentage` (number), bottone "×" per rimuovere la riga; sotto la lista, bottone "+ Aggiungi rata" che accoda `{ installmentNumber: installments.length + 1, offsetDays: "0", percentage: "0" }`. Alla rimozione, `installmentNumber` di tutte le righe rimanenti viene ricalcolato in sequenza (1, 2, 3…) — non serve un editor di ordinamento, le rate sono già mostrate nell'ordine in cui vengono pagate. Sotto l'editor, somma percentuali corrente in tempo reale (`text-accent-red` se ≠ 100, altrimenti `text-zinc-500`) così l'utente vede l'errore di validazione del backend prima di inviare.
- **Anteprima live** (sotto "Rate", dentro la stessa `Section` o in una `Section` "Anteprima" separata — separata, per non confondere "cosa configuro" con "cosa succederebbe"): un input numerico "Importo di esempio" (default `"1000"`, puramente locale, non inviato al backend) e una lista read-only, ricalcolata ad ogni render con `computePaymentSchedule(new Date(), { endOfMonth: form.endOfMonth, fixedDay: form.fixedDay ? Number(form.fixedDay) : null, installments: form.installments.map(...) }, Number(sampleAmount))`, riga per riga: `"Rata {n} — € {amount} — {dueDate formattata gg mmm aaaa}"`. Se una riga ha `percentage`/`offsetDays` non numerici o la somma percentuali non è ~100, l'anteprima mostra `"Completa le rate per vedere l'anteprima"` invece di calcolare su dati invalidi.

**Pagine**: `frontend/src/app/acquisti/condizioni-pagamento/nuovo/page.tsx` e `.../condizioni-pagamento/[id]/page.tsx`, stesso schema delle altre due entità; `CondizioniPagamentoTab.tsx` riceve bottone "+ Nuova condizione", righe cliccabili verso `[id]`, colonna "Utilizzo" (§7).

## 7. Contatori d'uso

**`backend/src/repositories/purchasing/warehouses.repo.ts`** (modifica) — `findAllWarehouses` include il conteggio:

```ts
export async function findAllWarehouses(prisma: PrismaClient) {
  return prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true } } },
  });
}
```

**`backend/src/repositories/purchasing/payment-terms.repo.ts`** (modifica) — `findAllPaymentTerms` aggiunge lo stesso `_count` sulle due relazioni già esistenti nello schema (`PaymentTerm.suppliers`, valorizzata da `Supplier.defaultPaymentTermId`, e `PaymentTerm.purchaseOrders`):

```ts
export async function findAllPaymentTerms(prisma: PrismaClient) {
  return prisma.paymentTerm.findMany({
    include: {
      installments: { orderBy: { installmentNumber: "asc" } },
      _count: { select: { suppliers: true, purchaseOrders: true } },
    },
    orderBy: { name: "asc" },
  });
}
```

Il tipo di ritorno di entrambe le funzioni guadagna `_count: { purchaseOrders: number }` / `_count: { suppliers: number; purchaseOrders: number }` — Prisma lo inferisce automaticamente dall'`include`, nessun tipo manuale da scrivere.

**`frontend/src/lib/api/purchasing.ts`** (modifica) — `Warehouse` e `PaymentTerm` guadagnano il campo opzionale corrispondente:

```ts
export interface Warehouse {
  id: string; name: string; code: string; address: string | null; isActive: boolean;
  _count: { purchaseOrders: number };
}
export interface PaymentTerm {
  id: string; name: string; type: string; endOfMonth: boolean; fixedDay: number | null;
  paymentMethod: string; isActive: boolean; installments: PaymentTermInstallmentRule[];
  _count: { suppliers: number; purchaseOrders: number };
}
```

**UI**: in `MagazziniTab.tsx`, nuova colonna "Utilizzo" con badge `"{n} ordini"` (grigio neutro se `n === 0`, altrimenti `text-accent-blue` come nel mockup approvato). In `CondizioniPagamentoTab.tsx`, stessa colonna con badge combinato `"{suppliers} fornitori · {purchaseOrders} ordini"`; se entrambi zero, badge grigio `"Non ancora usata"`.

## 8. API client (`frontend/src/lib/api/purchasing.ts`)

Il client oggi ha solo `list`/`create`/`deactivate` per tutte e tre le entità — manca `update` ovunque, anche dove il backend lo supporta già (Warehouse, BankAccount). Aggiunte:

```ts
warehouses: {
  list: () => get<Warehouse[]>("/api/purchasing/warehouses"),
  create: (data: { name: string; code: string; address?: string }) => post<Warehouse>("/api/purchasing/warehouses", data),
  update: (id: string, data: { name: string; address?: string }) => put<Warehouse>(`/api/purchasing/warehouses/${id}`, data),
  deactivate: (id: string) => del(`/api/purchasing/warehouses/${id}`),
},
paymentTerms: {
  list: () => get<PaymentTerm[]>("/api/purchasing/payment-terms"),
  create: (data: PaymentTermInput) => post<PaymentTerm>("/api/purchasing/payment-terms", data),
  update: (id: string, data: PaymentTermInput) => put<PaymentTerm>(`/api/purchasing/payment-terms/${id}`, data),
  deactivate: (id: string) => del(`/api/purchasing/payment-terms/${id}`),
},
bankAccounts: {
  list: () => get<BankAccount[]>("/api/purchasing/bank-accounts"),
  create: (data: CreateBankAccountInput) => post<BankAccount>("/api/purchasing/bank-accounts", data),
  update: (id: string, data: { bankName: string; alias: string; accountHolder: string; bic?: string; accountingCode?: string; notes?: string }) => put<BankAccount>(`/api/purchasing/bank-accounts/${id}`, data),
  deactivate: (id: string) => del(`/api/purchasing/bank-accounts/${id}`),
},
```

dove `PaymentTermInput` è il tipo già usato da `create`, estratto in un'interfaccia condivisa (`{ name: string; type: string; endOfMonth: boolean; fixedDay?: number; paymentMethod: string; installments: {...}[] }`) così `create` e `update` non duplicano la firma. Nuovo helper `put<T>()` accanto a `post`/`del` esistenti, stesso schema (`fetch` con `method: "PUT"`, `credentials: "include"`, JSON body, throw su `!res.ok`).

## 9. Cosa NON fa questa parte

- Nessun quick-create ("crea al volo") dentro i form Fornitore/Ordine — Parte 2.
- Nessun collegamento Banche↔Scadenzario (`paidFromBankAccountId`) — Parte 2, e con esso il contatore d'uso per le Banche.
- Nessun campo `defaultPaymentTermId` aggiunto a `SupplierForm.tsx` — Parte 2 (va di pari passo col quick-create, altrimenti sarebbe un `<select>` normale da ripopolare due volte).
- Nessun riordino manuale delle rate (drag&drop) — la rinumerazione automatica su aggiungi/rimuovi è sufficiente per lo scopo (vedere l'effetto), riordino manuale è YAGNI finché nessuno lo chiede.
- Nessun endpoint `GET /warehouses/:id` o `GET /payment-terms/:id` dedicato — le pagine `[id]` filtrano da `list()` già caricata, coerente con la scala attuale di queste tabelle (decine di righe, non migliaia).

## 10. Rischi

- **`updatePaymentTerm` cancella e ricrea le rate**: se il `PUT` fallisce a metà (fuori transazione) si perderebbero le rate esistenti senza sostituirle. Mitigato dal `prisma.$transaction(...)`: se `paymentTerm.update` fallisce dopo il `deleteMany`, l'intera transazione va in rollback, le rate originali restano intatte.
- **Percentuali che non sommano a 100 in modifica**: stessa validazione già in `createPaymentTerm` (tolleranza 0.01), riusata identica in `updatePaymentTerm` — nessun rischio nuovo, ma va comunque coperta da un test dedicato per la nuova funzione.
- **Disallineamento tra `payment-schedule.ts` backend e il mirror frontend**: stesso rischio già accettato per `NEXT_STATUSES`/state machine — mitigato mantenendo il mirror minimale (due funzioni pure, nessuna logica aggiuntiva) e con un commento esplicito in testa al file che rimanda all'originale.
- **`code` di `Warehouse` è `@unique`**: il form di modifica lo disabilita (coerente col backend, che oggi non lo accetta in `updateWarehouse`), quindi non c'è rischio di collisione in questa fase.

## 11. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans`.
