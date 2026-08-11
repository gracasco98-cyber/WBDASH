# Riorganizzazione sidebar — area ACQUISTI dedicata — Design

Data: 2026-08-11
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: primo di tre lavori concordati in sessione (sidebar → dashboard BI → redesign colori), ciascuno con il proprio ciclo brainstorm→piano→implementazione.

---

## 1. Problema

Durante la revisione di FASE D sono emerse due cose:

1. **Un bug reale**: la voce sidebar "Gestione utenti" puntava a `/admin` (un pannello di debug/sync legacy dell'epoca Shopify), non a `/admin/users` (la vera pagina di gestione utenti). Già corretto separatamente (PR #17), non fa parte di questo design.
2. **Una confusione strutturale**: il flusso Acquisti (Fornitori, Ordini Fornitore, e in futuro Ricezioni/DDT, Fatture, Scadenzario, Prima Nota) non ha una casa riconoscibile in sidebar. Oggi Fornitori/Banche/Magazzini/Condizioni-pagamento sono quattro tab dentro un'unica pagina "Anagrafiche", e Ordini Fornitore è una voce sorella isolata sotto Inventory — nessuna delle due cose comunica che fanno parte dello stesso processo.

Lo spec architetturale originale (`docs/superpowers/specs/2026-08-05-purchasing-erp-architecture.md`, §2) prevedeva già un'area di primo livello "Acquisti" in sidebar — non ancora realizzata perché FASE B/C hanno infilato le cose sotto Inventory per andare per gradi con meno contenuto. Ora che esistono sia Fornitori che Ordini Fornitore, ha senso formalizzarla.

## 2. Decisione: aree distinte, non un contenitore piatto

Confermato con l'utente: ogni fase del flusso documentale (Fornitori → Ordini → Ricezioni/DDT → Fatture → Scadenzario → Prima Nota) diventa una **voce propria e riconoscibile** in sidebar, non un tab dentro una pagina generica. Questo rispecchia il flusso di conversione documento→documento già previsto dallo spec (un Ordine si converte in una Ricezione, una Ricezione genera una Fattura, una Fattura genera Scadenze, una Scadenza pagata genera una riga di Prima Nota).

## 3. Nuova struttura sidebar

Sostituisce la voce "Anagrafiche" nel gruppo INVENTORY con un nuovo gruppo di primo livello ACQUISTI, posizionato dopo INVENTORY:

```
ACQUISTI
├─ Fornitori              → /acquisti/fornitori            (reale, spostato)
├─ Ordini Fornitore       → /acquisti/ordini                (reale, già esiste)
├─ Ricezioni / DDT        Prossimamente  (FASE E)
├─ Fatture Fornitore      Prossimamente  (FASE G)
├─ Magazzini              → /acquisti/magazzini             (reale, spostato)
├─ Banche                 → /acquisti/banche                (reale, spostato)
├─ Condizioni pagamento   → /acquisti/condizioni-pagamento  (reale, spostato)
├─ Scadenzario            Prossimamente  (FASE I)
└─ Prima Nota             Prossimamente  (FASE L)
```

Nessun divisore visivo tra i sotto-gruppi (documenti transazionali vs anagrafiche di supporto vs amministrazione futura): l'ordine delle voci comunica la sequenza, e il pattern "Prossimamente" già usato altrove nella sidebar distingue di per sé il reale dal non-ancora-costruito — aggiungere un separatore sarebbe un nuovo elemento UI non presente altrove nel componente, non necessario per risolvere il problema.

`INVENTORY` perde la voce "Anagrafiche" ma mantiene COGS e Magazzino (quello è lo stock Amazon sincronizzato via SP-API, concettualmente diverso dal magazzino fisico aziendale di questo modulo — nessuna fusione, stesso principio già stabilito nello spec architetturale §1).

## 4. Pagine da spostare/creare

Ogni voce reale diventa una pagina a sé (non più un tab):

| Oggi | Domani |
|---|---|
| `frontend/src/app/anagrafiche/page.tsx` (tab Fornitori, dentro `<FornitoriTab/>`) | `frontend/src/app/acquisti/fornitori/page.tsx` — stesso `<FornitoriTab/>`, wrapper pagina invece di tab |
| `frontend/src/app/anagrafiche/fornitori/nuovo/page.tsx` | `frontend/src/app/acquisti/fornitori/nuovo/page.tsx` (redirect interno aggiornato da `/anagrafiche/fornitori/${id}` a `/acquisti/fornitori/${id}`) |
| `frontend/src/app/anagrafiche/fornitori/[id]/page.tsx` | `frontend/src/app/acquisti/fornitori/[id]/page.tsx` |
| tab Magazzini (funzione `MagazziniTab` inline in `anagrafiche/page.tsx`) | nuovo componente `frontend/src/components/purchasing/MagazziniTab.tsx` (stesso pattern di `FornitoriTab.tsx`) + `frontend/src/app/acquisti/magazzini/page.tsx` |
| tab Banche (funzione `BancheTab` inline) | nuovo componente `frontend/src/components/purchasing/BancheTab.tsx` + `frontend/src/app/acquisti/banche/page.tsx` |
| tab Condizioni pagamento (funzione `CondizioniPagamentoTab` inline) | nuovo componente `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx` + `frontend/src/app/acquisti/condizioni-pagamento/page.tsx` |
| `frontend/src/app/anagrafiche/**` (intera cartella) | rimossa |

Nessuna nuova funzionalità in questo lavoro: le tre tab Magazzini/Banche/Condizioni-pagamento oggi sono sola-lettura (nessun form di creazione, a differenza di Fornitori) — restano sola-lettura dopo lo spostamento. Non è nello scope di questo redesign aggiungere form di creazione mancanti: è un puro spostamento/rinomina, verrà trattato come task a parte se richiesto.

Nessuna pagina indice `/acquisti` (landing page del gruppo): coerente con gli altri gruppi sidebar (FINANCE, INVENTORY, MARKETING non hanno una pagina indice propria), i link vanno diretti alle sotto-pagine.

## 5. File da modificare

- `frontend/src/components/layout/GlobalSidebar.tsx` — nuovo gruppo `ACQUISTI` (icona `ShoppingBag` da `lucide-react` — `ShoppingCart` è già usata dal link `/ordini` di primo livello, va tenuta distinta per non duplicare la stessa icona in due punti della stessa sidebar), rimozione voce "Anagrafiche" da INVENTORY
- `frontend/src/app/acquisti/fornitori/page.tsx` (nuovo)
- `frontend/src/app/acquisti/fornitori/nuovo/page.tsx` (spostato, redirect aggiornato)
- `frontend/src/app/acquisti/fornitori/[id]/page.tsx` (spostato)
- `frontend/src/app/acquisti/magazzini/page.tsx` (nuovo)
- `frontend/src/app/acquisti/banche/page.tsx` (nuovo)
- `frontend/src/app/acquisti/condizioni-pagamento/page.tsx` (nuovo)
- `frontend/src/components/purchasing/MagazziniTab.tsx` (nuovo, estratto da `anagrafiche/page.tsx`)
- `frontend/src/components/purchasing/BancheTab.tsx` (nuovo, estratto)
- `frontend/src/components/purchasing/CondizioniPagamentoTab.tsx` (nuovo, estratto)
- `frontend/src/app/anagrafiche/**` — rimosso interamente

## 6. Rischi

- **Link esterni/salvati**: se qualcuno ha un bookmark su `/anagrafiche` o `/anagrafiche/fornitori/...`, smette di funzionare (404). Rischio basso — tool interno aziendale, non indicizzato, pochissimi utenti (master + eventuali admin non ancora confermati). Nessun redirect HTTP predisposto, non richiesto esplicitamente.
- **Componente `FornitoriTab` ha ancora "Tab" nel nome** anche se non è più un tab — rinominarlo (es. `SuppliersList`) è cosmetico e fuori scope stretto, ma economico da fare nello stesso task se il piano lo prevede; da confermare in fase di piano.

## 7. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans` per il piano di implementazione. Dopo questo lavoro, sessioni di brainstorming dedicate per: (2) dashboard di Business Intelligence del gestionale, (3) redesign colori/visivo dell'intera app — entrambi confermati come prossimi passi ma volutamente non affrontati in questo design per non perdere qualità mischiando tre lavori distinti.
