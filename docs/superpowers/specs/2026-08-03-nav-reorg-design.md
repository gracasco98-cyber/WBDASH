# Riorganizzazione menu/navigazione — Design

Data: 2026-08-03
Stato: approvato in brainstorming, in attesa di piano di implementazione.

## Contesto e motivazione

Terzo sotto-progetto nato dalla sessione di brainstorming UI/UX (dopo [profit engine](2026-08-03-profit-engine-design.md) e le future tile BI, che restano rimandate). WBDASH oggi organizza il menu **per canale di vendita**: un gruppo "Amazon" con 10 voci, un gruppo "Marketplace" con 1 voce (Shopify). Per un vero gestionale questo non regge: le funzioni vanno raggruppate **per area di business** (Finance, Inventory, Marketing, Supporto), col canale che diventa un filtro applicato dentro ogni pagina, non una sezione di menu a sé.

Ispirazione presa da una dashboard di riferimento (screenshot forniti dall'utente) — non riprodotta 1:1, ma usata per la logica di raggruppamento e per due pattern specifici (filtro canale globale, voci "Prossimamente" per funzionalità non ancora costruite).

## Scope

- **Dentro**: nuova tassonomia sidebar (Finance/Inventory/Marketing/Supporto/Admin), due nuove pagine unificate cross-channel (Prodotti, Ordini), promozione del filtro Marketplace da stato locale-per-pagina a contesto globale, spostamento del selettore Account Amazon in un top bar globale.
- **Fuori**: redesign visivo delle tile KPI (sotto-progetto 2, dipende dal profit engine), qualunque nuova funzionalità dietro le voci "Prossimamente" (restano disabilitate, non si costruisce nulla dietro), rinominare gli URL delle pagine esistenti.

## Tassonomia finale

```
Dashboard        (root "/", cross-channel — futura casa delle tile BI del sotto-progetto 2)
Ordini           (NUOVO — lista unificata Amazon+Shopify, canale=filtro)

FINANCE
├─ P&L                        /amazon/pl (invariato)
├─ Pagamenti/Settlements      /amazon/payments (invariato)
├─ Fisco                      Prossimamente (disabilitato)
├─ Regole fees/IVA/spedizioni Prossimamente (disabilitato)
└─ Reportistica               Prossimamente (disabilitato)

INVENTORY
├─ Prodotti                   (NUOVO — unificato Amazon+Shopify, canale=filtro)
├─ COGS                       /amazon/cogs (invariato)
├─ Magazzino                  /amazon/inventory (invariato)
├─ Fornitori                  Prossimamente (disabilitato)
└─ Purchase Orders            Prossimamente (disabilitato)

MARKETING
├─ Advertising/PPC            /amazon/ppc (invariato)
├─ Intelligence                /amazon/analytics (invariato)
├─ Content Hub                Prossimamente (disabilitato)
└─ Calendario promo           Prossimamente (disabilitato)

SUPPORTO
└─ I miei ticket               Prossimamente (disabilitato)

ADMIN
├─ Gestione utenti            /admin (invariato)
├─ Sync Center                /amazon/sync (invariato)
└─ Sicurezza                  /account/security (invariato)
```

Le pagine esistenti mantengono i loro URL attuali — cambia solo come il menu le raggruppa/etichetta e a cosa puntano i link. Nessun redirect da gestire, nessun rischio di link rotti.

Le voci "Prossimamente" sono disabilitate/non cliccabili con un badge, coerente col pattern del riferimento — comunicano la visione futura del gestionale senza promettere funzionalità che non esiste.

## Architettura tecnica

### Filtri globali in top bar

- **Account Amazon**: `AmazonAccountContext`/`useAmazonAccount` è già montato globalmente in `app/layout.tsx` (nessuna modifica al contesto). Cambia solo dove vive il componente visivo: `AmazonAccountSelector` si sposta dall'header di `/amazon/layout.tsx` a un nuovo top bar globale in `app/layout.tsx`, visibile su ogni pagina del gestionale, non solo su quelle Amazon.
- **Marketplace**: oggi è stato locale per pagina (le pillole IT/DE/FR/ES dentro `frontend/src/app/amazon/page.tsx`, non condiviso tra pagine). Va promosso a un nuovo `MarketplaceFilterContext` (stesso pattern di `AmazonAccountContext`: localStorage + React context + custom hook `useMarketplaceFilter`), montato in `app/layout.tsx`. Le pagine che oggi gestiscono il proprio stato locale di marketplace lo sostituiscono con questo contesto condiviso.

### Pagine nuove (i soli due pezzi di lavoro "pesante")

- **`app/prodotti/page.tsx`** — sostituisce concettualmente `/amazon/products` e `/products` (Shopify): interroga entrambe le fonti dati, filtro canale (Tutti/Amazon/Shopify) oltre al filtro marketplace. Le vecchie pagine `/amazon/products` e `/products` restano nel codice finché la nuova pagina non è verificata, poi si valuta se rimuoverle o lasciarle come redirect.
- **`app/ordini/page.tsx`** — nuova lista ordini unificata Amazon+Shopify (oggi esiste solo `/amazon/orders` come lista, e un generico `/orders/[id]` come dettaglio per singolo ordine). Stesso pattern di filtro canale.

### Componenti da modificare/creare

- `GlobalSidebar.tsx` — riscritto da zero con le nuove categorie (oggi ha solo Dashboard/Marketplace/Amazon a due livelli).
- `AppHeader.tsx` — nuovo top bar con `AmazonAccountSelector` + nuovo `MarketplaceFilterSelector`, sempre visibili.
- `MarketplaceFilterContext.tsx`, `useMarketplaceFilter.ts` (nuovi, stesso pattern di `AmazonAccountContext.tsx`/`useAmazonAccount.ts`).
- Nessuna modifica alle pagine esistenti che restano dove sono (P&L, COGS, Magazzino, PPC, Analytics, Sync, Admin, Sicurezza) — solo ai link che puntano a loro dalla sidebar.

## Rischi

- Le pagine Amazon esistenti che oggi leggono il marketplace da stato locale vanno migrate a leggere dal nuovo contesto globale — se una pagina viene dimenticata, mostrerebbe dati non coerenti col filtro globale selezionato altrove. Da verificare pagina per pagina in fase di piano.
- Le due nuove pagine unificate (Prodotti, Ordini) sono il vero lavoro nuovo di questo sotto-progetto — la riorganizzazione del menu in sé è a basso rischio (solo etichette/raggruppamento), ma queste due pagine richiedono query cross-channel nuove.

## Test e verifica

- Verifica manuale in browser (Playwright/chrome-devtools) della nuova sidebar: ogni voce non-"Prossimamente" naviga alla pagina corretta, ogni voce "Prossimamente" è visibilmente disabilitata e non naviga.
- Verifica che il filtro Marketplace globale, cambiato in un punto qualsiasi del gestionale, si rifletta coerentemente in tutte le pagine che lo consumano (stesso test-pattern già usato per il cambio di Account Amazon).
- Test unitari per `MarketplaceFilterContext` (stesso schema dei test già scritti per `AmazonAccountContext`).

## Prossimo passo

Due spec ora approvate (profit engine + questa). Da confermare con l'utente l'ordine di **implementazione**: piano profit engine poi piano nav-reorg, oppure i due piani in parallelo su branch separati.
