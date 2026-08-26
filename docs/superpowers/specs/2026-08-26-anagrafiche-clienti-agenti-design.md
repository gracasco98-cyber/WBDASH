# Anagrafiche — Clienti e Agenti (Fase 2) — Design

Data: 2026-08-26
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: dopo il pattern denso applicato a Fornitori (fase precedente), l'utente ha chiesto di non trattare più "Fornitori" come pagina isolata ma come una scheda dentro un concetto più ampio di "Anagrafiche", dove poter aggiungere altri tipi di contatti (Clienti, Agenti, e in futuro altri). Chiarito in brainstorming: Clienti = "referenti/contatti aziendali generici" (non necessariamente legati a una vendita — le vendite reali passano da Amazon/Shopify), Agenti = "una semplice rubrica anagrafica". Entrambi molto più semplici di Fornitori (niente dati fiscali/pagamenti/prodotti collegati).

---

## 1. Obiettivo

Trasformare la pagina "Fornitori" in una pagina "Anagrafiche" con tre schede — **Fornitori** (invariata) · **Clienti** (nuova) · **Agenti** (nuova) — dove Clienti e Agenti sono rubriche semplici che condividono lo stesso modello dati e la stessa UI, parametrizzati da un campo "Tipo".

## 2. Modello dati — `BusinessContact` (nuovo)

Un'unica tabella per Clienti/Agenti/futuri tipi, non due tabelle duplicate. Nome scelto per non confondersi con `SupplierContact` (i contatti-persona già esistenti dentro un fornitore, concetto diverso e non toccato da questa fase).

```prisma
model BusinessContact {
  id        String   @id @default(cuid())
  type      String   // "CLIENTE" | "AGENTE" | valore libero — stesso pattern di Supplier.supplierType, nessun enum: aggiungere un nuovo tipo in futuro non richiede una migrazione
  name      String
  referent  String?  // persona di riferimento
  email     String?
  phone     String?
  address   String?  // riga singola, volutamente semplice
  notes     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
  @@index([isActive])
}
```

Solo `name` è obbligatorio — stesso principio "minimo indispensabile" già usato per gli altri modelli di anagrafica leggera (`Warehouse`: solo `name`+`code`).

`type` è una stringa libera, non un `enum` Prisma: coerente con `Supplier.supplierType` (già stringa libera in questo schema), e permette di aggiungere un futuro "Trasportatori" o altro senza migrazione — il vincolo ai due valori di oggi (`CLIENTE`, `AGENTE`) vive solo lato frontend (le pagine di creazione impostano il tipo, l'utente non lo sceglie da un campo libero).

## 3. Backend

- **`backend/src/repositories/purchasing/business-contacts.repo.ts`** (nuovo) — `findAllBusinessContacts()`, `createBusinessContact()`, `updateBusinessContact()`, `deactivateBusinessContact()`. CRUD completo fin da subito **incluso l'update** (a differenza di `PaymentTerm` nella fase precedente, dove l'update mancante è stato scoperto come gap solo dopo — qui lo includiamo fin dall'inizio).
- **`backend/src/purchasing/routes/business-contacts.routes.ts`** (nuovo) — `GET/POST/PUT/DELETE /business-contacts`, stesso schema di `master-data.routes.ts` (`DELETE` = disattiva, non cancella). Nessun filtro server-side per `type`: la lista è piccola (stessa scala di Fornitori/Magazzini), il filtro per tipo/stato avviene client-side come ovunque in questo gestionale.
- Migrazione Prisma additiva (nuova tabella, nessuna modifica a tabelle esistenti) — nessuna modifica distruttiva.

## 4. Frontend

### 4.1 Componenti condivisi (nuovi)

- **`frontend/src/components/purchasing/ContactForm.tsx`** — form generico (nome, referente, email, telefono, indirizzo, note), stile `Section`/`Field` già stabilito. Non ha un campo "Tipo" nel form: il tipo è deciso dalla pagina che lo usa (vedi §4.3), non dall'utente.
- **`frontend/src/components/purchasing/ContactsTab.tsx`** — lista generica: `PageHeader` (titolo passato come prop, ricerca, bottone "+ Nuovo") + `TabsWithCount` (Attivi/Disattivati) + tabella (Nome, Referente, Email, Telefono, Stato). Riceve `type` e `basePath` come prop (es. `type="CLIENTE"`, `basePath="/acquisti/anagrafiche/clienti"`) e filtra client-side la lista di `businessContacts` per quel tipo. Nessuna stat-tile (a differenza di Fornitori — non c'è un indicatore di qualità dati equivalente a "senza condizione di pagamento" per un contatto semplice).

### 4.2 Pagina Anagrafiche (nuova, sostituisce la pagina Fornitori attuale)

**`frontend/src/app/acquisti/anagrafiche/page.tsx`** — pagina unica con `TabsWithCount` in cima (Fornitori · Clienti · Agenti, ognuno col proprio conteggio) che sceglie cosa renderizzare sotto:
- Fornitori → `<FornitoriTab />`, invariato, riusato com'è.
- Clienti → `<ContactsTab type="CLIENTE" basePath="/acquisti/anagrafiche/clienti" title="Clienti" />`.
- Agenti → `<ContactsTab type="AGENTE" basePath="/acquisti/anagrafiche/agenti" title="Agenti" />`.

I tre conteggi in cima vengono da due fetch leggeri fatti dalla pagina stessa (`api.suppliers.list()` per il totale Fornitori, `api.purchasing.businessContacts.list()` per Clienti/Agenti, filtrati client-side) — sì, `FornitoriTab` rifà la sua stessa chiamata internamente per i propri dati. È una duplicazione minima e accettata: ogni Tab in questo gestionale si carica i propri dati in autonomia, non esiste (né serve introdurre qui) un layer di cache condiviso.

### 4.3 Pagine crea/modifica

- `/acquisti/anagrafiche/clienti/nuovo`, `/acquisti/anagrafiche/clienti/[id]` — usano `ContactForm` con `type` fissato a `"CLIENTE"`, redirect a `/acquisti/anagrafiche` dopo il salvataggio.
- `/acquisti/anagrafiche/agenti/nuovo`, `/acquisti/anagrafiche/agenti/[id]` — stesso pattern con `type="AGENTE"`.

Stesso schema già usato tre volte in questo progetto (Magazzini/Banche/Condizioni pagamento): pagine sottili che passano `type`/redirect al componente condiviso, nessun endpoint dedicato `GET /business-contacts/:id` — le pagine `[id]` filtrano da `list()` già caricata.

### 4.4 Migrazione della vecchia pagina Fornitori

- `frontend/src/app/acquisti/fornitori/page.tsx` (oggi la lista) diventa un redirect a `/acquisti/anagrafiche` (`router.replace`, non una cancellazione — eventuali link/bookmark esterni continuano a funzionare).
- Le pagine `/acquisti/fornitori/nuovo` e `/acquisti/fornitori/[id]` **non cambiano indirizzo** — solo la pagina-lista si sposta, non le pagine di dettaglio/creazione.
- **`frontend/src/components/layout/GlobalSidebar.tsx`**: la voce `{ href: "/acquisti/fornitori", label: "Fornitori" }` diventa `{ href: "/acquisti/anagrafiche", label: "Anagrafiche" }`.
- **`frontend/src/components/purchasing/dashboard/WorkAreasHub.tsx`**: stesso aggiornamento (`href`, `label`, e icona — da `Truck` a `Users`, più adatta a un concetto di anagrafiche generico che a soli Fornitori).

## 5. Cosa NON fa questa fase

- Nessun campo aggiuntivo oltre ai sei elencati in §2 (niente P.IVA/indirizzo strutturato/pagamenti per Clienti o Agenti — sono volutamente rubriche semplici, non anagrafiche fiscali come Fornitori).
- Nessun collegamento tra Clienti/Agenti e altre entità del gestionale (ordini, fatture, provvigioni) — sono puri contatti, non entità operative in questa fase.
- Nessuna modifica al modello/UI di Fornitori.
- Nessun filtro server-side per tipo/stato su `GET /business-contacts` — resta client-side, stessa scala ridotta di ogni altra anagrafica qui.

## 6. Rischi

- **Doppio fetch per i conteggi della pagina Anagrafiche**: minima ridondanza di rete (già presente altrove in forma diversa: ogni pagina di dettaglio fornitore rifà il proprio fetch), non un problema di correttezza.
- **`type` come stringa libera**: nessuna validazione DB che impedisca un typo (es. "Cliente" vs "CLIENTE") se in futuro si aggiungono altri punti di creazione — per ora l'unico modo di creare un `BusinessContact` è tramite le pagine `clienti/nuovo`/`agenti/nuovo`, che impostano il tipo in codice, non da input utente: il rischio di typo non esiste finché resta così.
- **Redirect della vecchia pagina Fornitori**: verificare in fase di test che non lasci un momento di "flash" della vecchia UI prima del redirect — comportamento accettabile per una migrazione di routing, non bloccante.

## 7. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans`.
