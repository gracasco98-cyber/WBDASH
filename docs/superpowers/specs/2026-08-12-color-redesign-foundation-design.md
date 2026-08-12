# Color Redesign — Fase 1 (Fondamenta + Shell globale) — Design

Data: 2026-08-12
Stato: design approvato dall'utente, pronto per `writing-plans`.
Origine: terzo dei tre lavori concordati in sessione (sidebar → dashboard BI → **redesign colori**), a sua volta diviso in fasi per dimensione (111 file frontend, 28 pagine).

Plugin installato per questo lavoro: `frontend-design@claude-plugins-official` (skill per interfacce frontend di alta qualità, da invocare esplicitamente in fase di implementazione).

---

## 1. Direzione confermata

- Redesign **più ampio** della sola palette (colori + coerenza visiva), non solo hex-swap.
- Struttura a fasi: **questa fase** = fondamenta (token colore) + shell globale (Header/Sidebar/KpiCard) + dashboard Amministrazione (`/acquisti`, già interamente a token). Il resto dell'app (dashboard vendite `/`, pagine Amazon, dettaglio Acquisti, Admin) in fasi separate successive, stesso schema già usato per il rollout del tema chiaro (`docs/superpowers/specs/2026-08-05-app-wide-light-theme-design.md`).
- Direzione stilistica: **palette più ricca ma coordinata** (stile Stripe/Linear Analytics) — non monocromatica, non scuro-dominante.
- **Verde primario invariato** come colore di marchio — non passiamo a blu/indaco.
- **Densità invariata** — nessun aumento di padding/spaziatura, il redesign lavora su colori/coerenza/dettagli, non su layout.

## 2. Palette — validata con lo script della skill `dataviz`, non a occhio

Metodo: partendo dal verde fissato come primario, ho enumerato e validato combinazioni di blu/ambra/rosso/viola con `scripts/validate_palette.js` (separazione daltonismo, banda di luminosità, contrasto), scartando ogni combinazione che falliva i controlli — non ho scelto hex a sensazione.

| Ruolo | Chiaro (oggi → nuovo) | Scuro (oggi → nuovo) |
|---|---|---|
| `accent.primary` (verde) | `#059669` → **invariato** | `#6ee7b7` → **`#059669`** (stesso hex di entrambi i temi) |
| `accent.blue` | `#1d4ed8` → **`#2a78d6`** | `#60a5fa` → **`#3987e5`** |
| `accent.amber` | `#d97706` → **`#eda100`** | `#fbbf24` → **`#b5a500`** |
| `accent.red` | `#dc2626` → **`#e34948`** | `#f87171` → **`#e66767`** |
| `accent.purple` | `#7c3aed` → **invariato** | `#a78bfa` → **`#9085e9`** |

Note tecniche verificate:
- Il verde (`#059669`) è **mode-invariant**: passa la banda di luminosità sia in chiaro (OKLCH L 0.43–0.77) che in scuro (0.48–0.67) con lo stesso hex — semplifica l'implementazione ovunque il verde è usato senza distinzione tema (vedi §4).
- L'ambra scura (`#b5a500`, L≈0.713) è **leggermente sopra** il limite tecnico della banda scura (0.67) — scelta deliberata: mantenendola più chiara si perde la separazione dal rosso sotto simulazione di daltonismo (fallisce il floor di sicurezza a "distinguibile anche a vista normale", ΔE<15); a `#b5a500` quella separazione è ampiamente superata (ΔE 20.3) al costo di un'uscita minima (+0.04) dalla banda raccomandata. La palette scura attuale (pre-redesign) era comunque molto più fuori banda su tutti e 5 i colori (fino a L=0.845) — questo è un miglioramento netto anche con l'eccezione.
- Ambra chiara (`#eda100`) ha un contrasto marginale (~2.1:1) se usata come sfondo pieno di badge — mitigato dal fatto che, verificato nel codice reale, `text-accent-amber` è **sempre** accompagnato da icona e/o testo descrittivo (mai un blocco di colore isolato), coerente con la regola della skill per i colori di stato ("mai il colore da solo a veicolare significato").

## 3. Bug trovati e da correggere in questa fase

1. **`KpiCard.tsx` — `accentMap` con colori sbagliati**: le etichette (`green`/`blue`/`purple`/`amber`/`red`) sono corrette ma i valori hex/rgb sono **tutti** tonalità oro/giallo (`#FFC300`, `#ECCB08`, `#F5E080`, `#D4AF00`, `#F4B400`) indipendentemente dall'etichetta — quindi il bagliore d'angolo e lo sfondo dell'icona di ogni KPI card sono sempre giallastri, mentre solo il valore numerico grande (che usa la classe Tailwind `cls`, corretta) mostra il colore giusto. Corretto mappando ogni etichetta al vero hex della palette (§2).
2. **`globals.css` — override tema chiaro per il viola punta a una classe inesistente**: la regola `[data-theme="light"] .text-accent-secondary { color: #7c3aed !important; }` non corrisponde a nessuna classe generata da Tailwind (il config definisce `accent.purple`, non `accent.secondary`) — ogni componente nel codice usa `text-accent-purple`. Risultato: il viola non ha **mai** avuto un override per il tema chiaro, resta silenziosamente il valore scuro anche quando il tema attivo è chiaro. Corretto rinominando la regola in `.text-accent-purple` con il nuovo hex.

## 4. File coinvolti in questa fase

**Fondamenta (fonte di verità, cambia tutto ciò che usa già le classi `text-accent-*`/`bg-accent-*`/`border-accent-*` in tutta l'app, senza toccare quei file):**
- `frontend/tailwind.config.js` — nuovi valori scuri (base) per `accent.primary/blue/amber/red/purple`.
- `frontend/src/app/globals.css` — nuovi valori chiari nel blocco `[data-theme="light"] .text-accent-*` (righe 251-256 circa), + fix del nome classe viola (§3.2).

**Shell globale:**
- `frontend/src/components/dashboard/KpiCard.tsx` — fix `accentMap` (§3.1); struttura aggiornata a coppie `{light, dark}` per hex/rgb (oggi un solo valore condiviso tra i due temi, sbagliato per blu/ambra/rosso/viola che *non* sono mode-invariant — solo il verde lo è).
- `frontend/src/components/layout/AppHeader.tsx` — standardizzazione dimensione icone (13px icone piccole, 15px link di primo livello); nessun cambio di colore necessario (già a token).
- `frontend/src/components/layout/GlobalSidebar.tsx` — stessa standardizzazione icone; nessun cambio di colore necessario (già a token).

**Dashboard Amministrazione (`/acquisti`, già interamente a token — diventa la prima pagina a mostrare il nuovo look):**
- `frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx` — barra verde hardcoded `#6ee7b7` (vecchio valore scuro) → `#059669` (mode-invariant, nessuna logica tema necessaria).
- `frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx` — gradiente verde hardcoded `#6ee7b7` → `#059669` (mode-invariant, stesso ragionamento).
- `frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx` — barra blu hardcoded `#60a5fa` (vecchio valore scuro) → **deve diventare theme-aware** (blu *non* è mode-invariant: `#2a78d6` chiaro / `#3987e5` scuro), leggendo `useTheme()` come già fa `KpiCard.tsx`. Oggi questo grafico mostra sempre il blu-scuro-pallido anche in tema chiaro (stesso tipo di bug del punto §3, non ancora emerso perché la dashboard è nuova).

**Fuori scope esplicito (fasi successive):** dashboard vendite (`/`), tutte le pagine Amazon, pagine dettaglio Acquisti (Fornitori/Ordini/Magazzini/Banche/Condizioni pagamento), Admin. Attenzione particolare in quelle fasi: alcuni gialli/colori nel codice rappresentano marchi di canale (es. giallo Amazon in `SalesChart.tsx`) e **non** vanno confusi con il token semantico `accent-amber` — da distinguere caso per caso quando si affrontano quei file, non in questa fase.

## 5. Rischi

- **Rollout parziale per design**: dopo questa fase, l'app avrà temporaneamente due "linguaggi" visivi (shell + Acquisti col nuovo look, resto con il vecchio) — accettato esplicitamente come conseguenza della struttura a fasi scelta, stesso pattern già vissuto durante il rollout del tema chiaro.
- **`TopSuppliersChart` diventa theme-aware**: unico componente di questa fase che richiede logica condizionale nuova (non solo sostituzione di un hex) — piccolo rischio di regressione se il colore non si aggiorna al cambio tema a runtime (va verificato manualmente toggling il tema).
- **Ambra scura fuori banda di +0.04**: rischio estetico minimo, documentato come scelta deliberata (§2), non un errore.

## 6. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans` per il piano di implementazione. Skill `frontend-design` da invocare nella fase di implementazione (non qui) per la qualità del codice UI prodotto.
