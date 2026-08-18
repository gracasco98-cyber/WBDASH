# Redesign pagina dettaglio ordine (`/acquisti/ordini/[id]`) — Design

Data: 2026-08-18
Stato: design approvato dall'utente (via companion visivo), pronto per `writing-plans`.

---

## 1. Contesto e obiettivo

Il redesign colori del 2026-08-12 ha toccato solo la shell (Header/Sidebar/KpiCard) e la dashboard Acquisti, escludendo esplicitamente le pagine di dettaglio ("fuori scope, fasi successive"). La pagina di dettaglio ordine (`frontend/src/app/acquisti/ordini/[id]/page.tsx`) è rimasta con il layout originale di FASE D — uno stack verticale di card tutte uguali, senza gerarchia visiva — a cui si sono aggiunte in FASE E1 le sezioni DDT e "zona pericolosa" (eliminazione), anch'esse costruite riusando lo stesso stile piatto senza rifinitura.

Obiettivo: ristrutturare la pagina con una gerarchia visiva chiara, riusando esattamente i token colore/tema già esistenti (nessun nuovo colore, nessuna nuova variabile CSS) — è un lavoro di layout e composizione, non di palette.

## 2. Direzione approvata (via mockup)

**Due colonne + stepper**, validata nel companion visivo:

- **Stepper a tutta larghezza** in cima, dentro la card di testata insieme a numero ordine e badge di stato: sostituisce la sequenza "badge di stato" + "lista bottoni azione" separati con una barra di avanzamento del ciclo di vita dell'ordine.
- **Colonna principale (sinistra, ~64%)**: righe ordine (tabella già esistente), sezione Ricezioni/DDT (form + lista già esistenti, riposizionati).
- **Sidebar (destra, ~36%)**: dati anagrafici (fornitore, magazzino, data, valuta), azioni di stato (stessi pulsanti di oggi, spostati qui), zona pericolosa (eliminazione) in fondo, sempre isolata visivamente con bordo rosso.
- **Storico stato**: da card sempre aperta a sezione collassabile (`<details>`) in fondo alla sidebar — resta raggiungibile ma non occupa spazio permanente.
- **Responsive**: sotto la soglia desktop, la sidebar scende sotto il contenuto principale (stack verticale), stepper resta a tutta larghezza e si adatta (scroll orizzontale o wrap se necessario su schermi molto stretti).

## 3. Stepper — logica di mappatura stato

Lo stepper mostra 7 tappe fisse, comprimendo gli stati "parziale" nella tappa successiva più vicina (evita 11 tappe illeggibili su schermo):

```
Bozza → Inviato → Confermato → In produzione → Pronto → Spedito → Ricevuto
```

Mappatura `logisticStatus` → tappa attiva:
- `DRAFT`→Bozza, `SENT`→Inviato, `CONFIRMED`→Confermato, `IN_PRODUCTION`→In produzione, `READY`→Pronto
- `PARTIALLY_SHIPPED` e `SHIPPED` → entrambi mappano sulla tappa "Spedito" (la prima con un badge "parziale" sovrapposto, la seconda piena)
- `PARTIALLY_RECEIVED` e `RECEIVED` → entrambi mappano sulla tappa "Ricevuto" (stesso trattamento "parziale" vs piena)
- `COMPLETED` → non ancora raggiungibile nella business logic attuale (FASE G/M) — trattato come "Ricevuto" pieno, nessuna tappa dedicata per ora (si aggiunge quando FASE G/M la rende raggiungibile)
- `CANCELLED` → **non usa lo stepper**: sostituito da un banner dedicato rosso "Ordine annullato" nella card di testata (lo stepper non ha senso per un ordine annullato, qualunque fosse la tappa raggiunta prima dell'annullamento)

Tappe già superate: verde pieno. Tappa attuale: blu. Tappe future: grigio spento. Nessuna logica di business nello stepper stesso — è puro mapping di visualizzazione, la state machine (`purchase-order-state-machine.ts`) resta l'unica fonte di verità per cosa è permesso, lo stepper non decide nulla, si limita a mostrare `logisticStatus`.

## 4. Componenti

- **`frontend/src/components/purchasing/OrderStatusStepper.tsx`** (nuovo) — riceve `logisticStatus`, disegna le 7 tappe con la mappatura sopra, o il banner "Annullato" se `CANCELLED`. Nessuna chiamata API, puro componente di presentazione.
- **`frontend/src/app/acquisti/ordini/[id]/page.tsx`** (ristrutturato, non riscritto da zero) — stessa logica di stato/caricamento dati già esistente (`load`, `loadReceipts`, `handleTransition`, `handleDelete`), cambia solo la disposizione JSX in due colonne + stepper + storico collassabile. `GoodsReceiptForm`/`GoodsReceiptsList` restano componenti separati già esistenti, semplicemente riposizionati nella colonna principale.
- Nessuna nuova chiamata API, nessun nuovo tipo, nessun cambiamento al backend — solo composizione/layout frontend.

## 5. Rischi

- **Nessuno lato dati**: zero modifiche a repository/route/schema, quindi zero rischio di regressione funzionale — solo rischio visivo (rotture di layout su viewport strette), mitigato testando manualmente a larghezza ridotta.
- **Stepper e stato "parziale"**: il badge "parziale" sovrapposto sulla tappa Spedito/Ricevuto è puramente informativo — va verificato che resti leggibile anche su schermi piccoli.

## 6. Fuori scope

- Le altre pagine dettaglio Acquisti (Fornitori, Magazzini, Banche, Condizioni pagamento) — restano come sono, eventuale fase futura.
- Qualunque nuovo colore o token — si riusano solo quelli già definiti in `globals.css`/`tailwind.config.js`.

## 7. Prossimo step

Design approvato in sessione (mockup nel companion visivo). Prossimo passo: `writing-plans`.
