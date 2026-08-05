# App-wide light theme (Sellerboard-style) — Design

## Contesto

Decisione esplicita dell'utente durante lavoro autonomo notturno: portare l'intera dashboard al tema chiaro come default, stile Sellerboard, invece di lasciare chiaro/scuro miste pagina per pagina. Questa nota è scritta in modalità autonoma (nessuna sessione di brainstorming interattiva) per rispettare la richiesta esplicita di procedere senza interruzioni per alcune ore — le decisioni sotto sono chiamate dirette, non concordate punto per punto.

## Scoperta chiave

Il sistema di tema **esiste già** ed è più maturo del previsto:
- `frontend/src/app/globals.css` definisce variabili CSS per entrambi i temi (`:root` = scuro di default, `[data-theme="light"]` = chiaro) — già usate da `tailwind.config.js` (`bg-bg-base`, `bg-bg-card`, `bg-bg-hover`, `border-bg-border`).
- `frontend/src/components/ThemeProvider.tsx` gestisce un vero toggle (localStorage-persisted), già montato in `layout.tsx`, con un pulsante "Passa al tema chiaro/scuro" già visibile nell'header.
- **71 file** su ~80 già usano correttamente i token semantici (`bg-bg-card`, `border-bg-border`) — funzionerebbero già perfettamente in chiaro.
- **10 file** hardcodano classi Tailwind scure (`bg-zinc-9*`, `bg-gray-9*`, `bg-black`) invece dei token, quindi restano scuri indipendentemente dal tema attivo.

Il lavoro non è "costruire un tema chiaro da zero" — è: (1) far diventare il chiaro il default per i nuovi visitatori, (2) sistemare i 10 file che non rispettano ancora il sistema di token già esistente.

## Scope

**Dentro questa fase:**
1. `ThemeProvider.tsx`: default `"dark"` → `"light"` per chi non ha ancora un `localStorage` salvato (chi ha già scelto scuro esplicitamente lo mantiene).
2. Sistemare i 10 file con classi hardcoded scure, sostituendole con i token già esistenti (`bg-bg-card`, `bg-bg-hover`, `border-bg-border`, testo secondo convenzione già in uso in `GlobalSidebar.tsx`/`AppHeader.tsx` per le parti già a token):
   - `src/components/layout/AppHeader.tsx` (134 righe, shell globale — priorità alta, tocca ogni pagina)
   - `src/components/dashboard/ShopifyBIOverview.tsx` (821 righe)
   - `src/app/amazon/cogs/page.tsx` (736 righe)
   - `src/app/amazon/inventory/page.tsx` (725 righe)
   - `src/app/admin/users/page.tsx` (574 righe)
   - `src/components/ChatWidget.tsx` (398 righe)
   - `src/components/amazon/AmazonRevenueChart.tsx` (245 righe)
   - `src/app/amazon/pl/page.tsx` (228 righe)
   - `src/components/products/ProductDetailModal.tsx` (169 righe)
   - `src/components/dashboard/HourChannelModal.tsx` (156 righe)
3. Verifica visiva finale (chrome-devtools MCP) su almeno: home, /amazon, /amazon/pl, /amazon/cogs, /ordini — confermare nessuna scritta illeggibile (testo chiaro su sfondo chiaro, residuo di un default scuro non convertito).

**Fuori scope:**
- Rimuovere il tema scuro/il toggle — resta disponibile, cambia solo il default.
- Le pagine `/amazon/analytics`, `/amazon/orders`, `/amazon/ppc`, `/amazon/products`, `/amazon/sync`, `/amazon/payments`, `/account/security`, `/admin`, `/orders/[id]`, `/login`, `/products` non hanno colori hardcoded scoperti in questa survey (già a token) — verificate solo visivamente nella verifica finale se il tempo lo consente, non riscritte.

## Approccio esecutivo

Ogni fileviene sistemato come task indipendente (subagent-driven-development), stesso pattern già usato in questa sessione: leggere il file, sostituire ogni classe hardcoded scura con il token semantico equivalente più vicino (stesso ruolo visivo: sfondo card → `bg-bg-card`, sfondo hover → `bg-bg-hover`, bordo → `border-bg-border`), verificare `tsc --noEmit` + test esistenti (se presenti) restano verdi, commit.
