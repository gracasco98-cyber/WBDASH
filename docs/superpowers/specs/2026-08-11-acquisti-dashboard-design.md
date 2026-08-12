# Dashboard Amministrazione (BI Acquisti) — Design

Data: 2026-08-11
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: secondo dei tre lavori concordati in sessione (sidebar → **dashboard BI** → redesign colori).

---

## 1. Cosa costruisce

Una landing page di Business Intelligence per l'area acquisti/amministrazione — oggi il gruppo sidebar (appena rinominato ACQUISTI → AMMINISTRAZIONE, vedi §5) porta direttamente alle singole pagine (Fornitori, Ordini, ecc.) senza un punto d'ingresso che dia una vista d'insieme.

## 2. Stato dei dati oggi (verificato prima di disegnare le tile)

- **Reale**: `PurchaseOrder`/`PurchaseOrderLine` (FASE D), `Supplier` (FASE C) — ordini in corso, valore, fornitori attivi, breakdown per stato, andamento nel tempo, top fornitori sono tutti calcolabili da questi due modelli, nessun dato nuovo da introdurre.
- **Non ancora reale**: magazzino fisico interno (`StockMovement`/`InventoryLot`, FASE F) e Fatture Fornitore (`SupplierInvoice`, FASE G) non esistono — le loro tile mostrano "Prossimamente", stesso pattern già usato ovunque nell'app.

## 3. Layout — `frontend/src/app/acquisti/page.tsx`

### 3.1 KPI row (stat tile, non grafici — sono numeri singoli con eventuale trend, non un confronto di categorie)
- Ordini in corso — conteggio `PurchaseOrder` con `logisticStatus` non in `(CANCELLED)` e non nello stato terminale `COMPLETED` (oggi `COMPLETED` non è comunque raggiungibile, quindi in pratica: tutto tranne `CANCELLED`)
- Valore ordini in corso — somma `PurchaseOrderLine.totalAmount` sulle righe degli ordini in corso
- Fornitori attivi — conteggio `Supplier` con `isActive = true`
- Magazzino — tile "Prossimamente" (FASE F)
- Fatture da riconciliare — tile "Prossimamente" (FASE G)

### 3.2 Grafici — forma scelta in base al lavoro del dato, non a occhio (skill dataviz)

- **Ordini per stato logistico** — il lavoro è "confronta la magnitudine tra categorie" → **bar chart**, un'unica tinta (`accent-primary`, coerente con l'uso già presente nell'app come colore "principale/positivo"). Niente colore diverso per barra: qui la barra è la magnitudine, non l'identità.
- **Andamento ordini nel tempo** (ultimi 30/90 giorni, aggregazione giornaliera) — serie temporale a singola serie → **area chart** con gradiente, stesso stile già usato in `frontend/src/components/dashboard/SalesChart.tsx` (`AreaChart` di Recharts, gradiente SVG `stopColor="#6ee7b7"`, tooltip custom coerente con `bg-card`/`bg-border`) — riuso del pattern visivo esistente, non un componente nuovo da zero.
- **Top fornitori per valore ordini** (primi 5) — altro confronto di magnitudine → **bar chart orizzontale** (nomi fornitore spesso lunghi, l'orizzontale evita il troncamento), tinta `accent-blue` per distinguerlo visivamente dal grafico stati.

Verifica fatta con lo script di validazione della skill dataviz sulla palette accent già in uso nell'app (`#6ee7b7,#60a5fa,#fbbf24,#f87171,#a78bfa`): separazione CVD/daltonismo e contrasto sulla superficie scura **passano**; un check di uniformità della banda di luminosità fallisce (i colori sono tutti abbastanza chiari/pastello). Non è un problema di sicurezza (i colori restano distinguibili), è un dettaglio di raffinatezza — lasciato al progetto di redesign colori già pianificato come terzo lavoro, non toccato qui per non aprire un fronte a metà.

### 3.3 Tabella ultimi ordini
Ultimi 10 `PurchaseOrder` per `orderDate` decrescente, colonne coerenti con `/acquisti/ordini`: numero, fornitore, data, stato, totale — riga cliccabile verso il dettaglio.

### 3.4 Hub aree di lavoro
Card di accesso rapido a Fornitori / Ordini Fornitore / Magazzini / Banche / Condizioni pagamento — rispecchia le voci reali del gruppo sidebar, utile su mobile/tablet dove la sidebar è nascosta (`hidden md:flex` in `GlobalSidebar.tsx`).

### 3.5 Stati vuoti
Ogni grafico e la tabella mostrano un messaggio "Nessun dato ancora" invece di un'area vuota o un errore, dato che il volume di dati reali oggi è basso — stesso principio già applicato nelle liste esistenti (Fornitori, Ordini) con "Nessun fornitore — inizia creandone uno" ecc.

## 4. Backend — nuovo endpoint di aggregazione

`GET /api/purchasing/dashboard` (nuova route in `purchase-orders.routes.ts`, mount esistente su `/api/purchasing`) — nessun nuovo modello, solo query aggregate su `PurchaseOrder`/`PurchaseOrderLine`/`Supplier` via una nuova funzione nel repository layer (`backend/src/repositories/purchasing/purchase-orders.repo.ts` o un nuovo file dedicato `dashboard.repo.ts`, decisione di dettaglio per il piano). Risposta: conteggio/valore ordini in corso, fornitori attivi, breakdown per stato, serie temporale ordini per giorno, top 5 fornitori per valore, ultimi 10 ordini.

## 5. Modifiche sidebar (richieste in sessione, non nel design originale)

- Il gruppo **ACQUISTI diventa AMMINISTRAZIONE** (stesso `key` interno rinominato, stesse voci reali/Prossimamente già decise nel redesign precedente).
- **Riposizionato per primo** nell'array `GROUPS` di `GlobalSidebar.tsx` — oggi tra INVENTORY e MARKETING, diventa il primo gruppo, subito dopo i link di primo livello Dashboard/Ordini e prima di FINANCE.
- Nuova voce **"Panoramica"** in cima al gruppo, che punta a `/acquisti` (questa dashboard) — prima voce del gruppo, sopra Fornitori.
- **Le URL restano `/acquisti/**`** — confermato esplicitamente: rinominare anche i path avrebbe richiesto spostare di nuovo tutte le pagine appena mersate in produzione (PR #18) senza un beneficio proporzionato. Solo l'etichetta e la posizione del gruppo cambiano, non gli URL.

## 6. Rischi

- **Dati scarsi in produzione**: il grafico a serie temporale specialmente sarà quasi vuoto nell'uso reale iniziale — gli stati vuoti (§3.5) sono la mitigazione, non serve dato finto/demo.
- **Palette non ancora "raffinata"** (§3.2): accettato consapevolmente, rimandato al redesign colori.
- **Nuova query di aggregazione**: nessun indice nuovo dovrebbe servire (le query si appoggiano agli indici già creati in FASE D su `logisticStatus`, `orderDate`, `supplierId`), ma va verificato nel piano con un query plan se il volume cresce.

## 7. Prossimo step

Design approvato. Prossimo passo: `writing-plans` per il piano di implementazione (endpoint backend con test, componenti grafico frontend, pagina dashboard, modifiche sidebar).
