# CLAUDE.md — WBDASH

Questo file definisce come Claude Code deve lavorare su questo repository. Le regole qui contenute sono vincolanti e prevalgono su comportamenti di default. In caso di conflitto con `docs/PROJECT_SPEC.md` o con i documenti in `docs/phases/`, questo file ha priorità sulle regole operative; i documenti di fase hanno priorità sui contenuti funzionali.

## Ruolo

Agisci come Principal Software Architect, Senior Full-Stack Engineer, Database Architect e DevOps Engineer responsabile di un gestionale aziendale mission-critical. Il sistema gestirà vendite, profitti, ordini, fornitori, prodotti, inventario, fatture, prima nota, scadenze e marketing per un'azienda che vende su Amazon, Shopify e altri canali.

Lavora con estrema prudenza. Procedi per fasi, moduli, branch Git e piccoli incrementi verificabili. Non tentare mai di sviluppare l'intera applicazione in un'unica operazione.

## Stato del progetto (aggiornato 2026-07-30)

**Non si parte da zero.** Il 2026-07-30 è stato importato in questo repository un codebase reale, già in produzione (AWS Lightsail), che implementa la maggior parte della Fase 1 (e alcune parti di Fase 2/3): sync Shopify multi-canale, integrazione Amazon SP-API (ordini, ads/PPC, settlement, COGS, inventory, forecasting), auth con MFA, dashboard cross-channel. Questo cambia lo stack rispetto alle assunzioni iniziali di Fase 0 — vedi tabella sotto.

Prima di questo import, il repository conteneva solo documentazione di progettazione (nessun codice). Ora contiene un'applicazione funzionante ma con debiti tecnici noti e documentati (`docs/tech-debt.md`) e con gap rispetto ai principi non negoziabili di WBDASH (vedi §Roadmap di adeguamento).

**Prima di ogni task, leggi anche `docs/PROJECT_SPEC.md`, `docs/phases/PHASE_01_SALES_PROFIT.md` e `docs/tech-debt.md`.**

## Stack reale (sostituisce le assunzioni iniziali di Fase 0)

| Area | Tecnologia reale |
|---|---|
| Backend | Node.js + Express + TypeScript (non NestJS) |
| Frontend | Next.js 14 + Tailwind CSS |
| Grafici | Recharts |
| Database | PostgreSQL + Prisma ORM |
| Autenticazione | Custom: bcrypt + express-session + connect-pg-simple + MFA (otplib/qrcode) — non Auth.js |
| Amazon | Selling Partner API, integrazione già estesa (orders, ads, settlement, COGS, inventory, forecast) |
| Shopify | Admin GraphQL API + webhook + polling 60s |
| Repository layer | `backend/src/repositories/**` — unico punto di accesso a Prisma |
| Test | Vitest + Testcontainers (Postgres reale) + MSW (mock API esterne) |
| CI/CD | GitHub Actions (`ci-backend`, `ci-frontend`, `pr-quality`) |
| Hosting | AWS Lightsail, Docker Compose, deploy manuale via SCP (il server non ha git) |
| Monorepo tool | Nessuno — `backend/` e `frontend/` sono due app Node indipendenti nello stesso repo |

Non introdurre NestJS, Auth.js o un tool di monorepo (Turborepo/pnpm workspaces) senza che il task lo richieda esplicitamente e senza discuterlo prima: sarebbe una riscrittura, non un'estensione.

## Principi non negoziabili

1. Sicurezza dei dati e segregazione per organizzazione/account. *(Gap attuale: single-tenant, nessun modello Organization — vedi roadmap)*
2. Integrità referenziale: foreign key reali, non tabelle generiche "data"/"settings".
3. Idempotenza di tutte le sincronizzazioni (Shopify e Amazon). Già rispettato per lo più: upsert su chiavi univoche (`amazonOrderId`, `orderItemId`, ecc.).
4. Tracciabilità delle modifiche: `AuditLog` già presente per auth/admin; da estendere alle entità economiche.
5. Separazione tra dati raw, normalizzati e aggregati. *(Gap attuale: non c'è un layer di payload raw persistito separatamente — vedi roadmap)*
6. Migrazioni database reversibili e verificabili; **nessuna migrazione già applicata va modificata**. Ogni modifica a `backend/prisma/schema.prisma` richiede migration committata + approvazione esplicita di un secondo reviewer (umano, o esplicita conferma dell'utente se lavori con Claude Code).
7. Nessuna modifica distruttiva (drop tabella/colonna/indice) senza autorizzazione esplicita dell'utente.
8. Test prima del merge: unit, integration (Testcontainers), casi limite. Vedi fixture esistenti in `backend/tests/fixtures/`.
9. Una branch = un solo obiettivo. Nessun lavoro diretto su `main` o `develop` (sempre via PR, anche se la disciplina non è enforced da GitHub — vedi `docs/branch-protection.md`).
10. Nessun segreto nel repository. Credenziali Amazon (`AMAZON_EU_REFRESH_TOKEN`) e Shopify (`SHOPIFY_ADMIN_TOKEN`) solo in `.env`, mai committate. `amazon-auth.js` gestisce l'OAuth flow e scrive il refresh token in `.env` in locale.
11. Nessun dato economico va sovrascritto senza storico. *(Parzialmente rispettato: `AmazonCogsPriceEntry` ha storico temporale; il calcolo di profitto/P&L non ha ancora versionamento esplicito — vedi roadmap)*
12. Nessun saldo di magazzino va modificato direttamente: `AmazonInventory` oggi è uno snapshot, non un ledger di movimenti — da introdurre quando si affronta la Fase 5 (magazzino).
13. Tutti gli importi monetari devono usare `Decimal`, mai `float`. *(Rispettato dal 2026-07-30 per tutti i campi realmente monetari; ACOS/ROAS/CTR e i coefficienti EWMA di `AmazonForecastCalibration` restano `Float` di proposito, non sono importi — vedi `docs/tech-debt.md` E.2)*
14. Tutte le date sono salvate in UTC e mostrate nel fuso orario configurato. Attenzione: esiste un bug noto di disallineamento cutoff "last7" tra Shopify e Amazon (`docs/tech-debt.md` A.2) — non introdurne di nuovi, e se tocchi codice date-related usa una funzione condivisa `italyDayStart()`.
15. Ogni tabella prevede `createdAt`/`updatedAt` quando appropriato — già rispettato nello schema esistente.
16. Le cancellazioni preferiscono soft delete quando lo storico va conservato.
17. Gli eventi da API esterne dovrebbero conservare il payload originale. *(Gap attuale — vedi roadmap)*
18. I calcoli economici devono essere riproducibili dagli input che li hanno generati.
19. `prisma db push` è consentito solo in sviluppo locale rapido; migrazioni versionate (`prisma migrate dev`) obbligatorie per tutto ciò che arriva su `develop`/`main`.

## Regole di esecuzione (invariate, rafforzate dall'esperienza reale del progetto)

Prima di modificare qualsiasi file:

1. Leggi `README.md`, questo `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`.
2. Controlla lo stato Git (`git status`) e la branch corrente.
3. Verifica che non esistano modifiche non committate estranee al task.
4. Leggi `docs/tech-debt.md` per sapere se l'area che stai per toccare ha già debiti/quirk noti e testati (lockati nei test — non "fixare" un quirk senza discuterne, potrebbe rompere un comportamento intenzionale).
5. Analizza lo schema database corrente (`backend/prisma/schema.prisma`) e le migrazioni esistenti.
6. Identifica i test esistenti rilevanti (`backend/tests/`, `frontend/src/test/`).
7. Presenta un piano sintetico e la lista dei file che prevedi di modificare, prima di scrivere codice.

**Regola assoluta ereditata dal progetto adottato**: route, service, webhook e job NON chiamano mai Prisma direttamente. Solo `backend/src/repositories/**` accede a `PrismaClient`. Vedi `CONTRIBUTING.md` per l'esempio corretto/scorretto.

**Limiti dimensione file (soft, motivare eccezioni in PR)**: route file ≤400 LOC, componente React ≤300 LOC, service ≤500 LOC, page Next.js ≤300 LOC. Diversi file superano già questi limiti (`docs/tech-debt.md` sezione B) — non sei obbligato a refactorarli se non è nello scope del task, ma non aggiungerne di nuovi sopra soglia.

Vietato senza autorizzazione esplicita dell'utente:

- `git reset --hard`, `git clean -fd`, `git checkout -- <file>`, force push, eliminazione massiva di branch.
- Modificare una migrazione già applicata.
- Eseguire migrazioni sull'ambiente production senza conferma.
- Eliminare tabelle, colonne, indici o relazioni.
- Deploy manuale via SCP senza che la PR sia mergiata su `main` con CI verde (vedi `DEPLOY_CHECKLIST.md`).

## Strategia Git

Branch: `main` (produzione), `develop` (integrazione), `feature/*`, `fix/*`, `refactor/*`, `chore/*`, `test/*`, `migration/*`, `hotfix/*`, `release/*`.

Commit message: `type(scope): descrizione breve` — vedi `GIT_WORKFLOW.md` per la tabella tipi ed esempi.

PR: target ≤500 LOC diff, scope singolo, CI verde (`ci-backend`/`ci-frontend`/`pr-quality`) obbligatoria prima del merge. Vedi `CONTRIBUTING.md` per template PR.

## Architettura attuale (per dominio, non per modulo NestJS)

```
backend/src/
├── auth/            # login, sessioni, MFA, password policy, admin routes
├── amazon/           # SP-API: orders, ads, settlement, COGS, inventory, forecast
│   └── forecast/      # calibrazione, stagionalità, bias detection, snapshot
├── services/         # Shopify: shopify.service, order.service, product.service
├── repositories/      # unico accesso a Prisma (amazon/*, shopify/*)
├── routes/            # stats, analytics, products, chat
├── webhooks/          # Shopify webhook handler
├── jobs/              # sync.job (storico + polling)
├── chat/              # tool-calling OpenAI su dati dashboard
├── sse/               # server-sent events per live feed
└── middleware/         # auth middleware

frontend/src/
├── app/               # pagine Next.js (dashboard, /amazon/**, /admin, /login, /account/security)
├── components/         # dashboard/, amazon/, amazon/payments/, auth/, products/, layout/
├── hooks/             # useCrossChannelData, usePaymentsData, usePeriodFilter, useSSE
└── lib/               # api client tipizzato, formatters, marketplace config
```

I moduli futuri non ancora implementati (magazzino con ledger, fornitori, ordini di acquisto, fatture/prima nota/scadenzario, listing multi-marketplace) restano nella visione a lungo termine descritta in `docs/PROJECT_SPEC.md`, ma vanno costruiti seguendo i pattern già in uso qui (repository layer, route Express, test con Testcontainers), non introducendo NestJS a metà progetto senza motivo esplicito.

## Roadmap di adeguamento ai principi non negoziabili

Gap noti tra questo codebase e i principi WBDASH, da trattare come task futuri e non come blocco all'uso del sistema oggi:

0. **Nessuno storico di migrazioni**: `backend/prisma/` non contiene una cartella `migrations/` — lo schema è sempre stato applicato con `prisma db push`. Il primo `prisma migrate dev --name init` va eseguito e committato prima di qualsiasi altra modifica allo schema, per stabilire una baseline versionata (principio non negoziabile #6). **Ancora da fare.**
1. ~~**Decimal invece di Float** per tutti gli importi monetari~~ — **fatto e verificato il 2026-07-30** (database era vuoto, nessun backfill necessario). Vedi `docs/tech-debt.md` sezione E.2 per come è stato implementato (conversione al confine del repository layer + estensione Prisma centralizzata per ogni operazione, non solo le query raw) e sezione E.1 per il debito scoperto nel farlo (repo-layer non rispettato nel dominio Amazon). Verifica end-to-end con Testcontainers eseguita su Postgres reale (Docker Desktop installato appositamente): 250 test passati, 0 fallimenti legati a Decimal.
2. ~~**Multi seller-account Amazon**~~ — **fatto il 2026-07-31** (backend + frontend, incl. selettore account in UI e guard contro i 500 su account ambiguo): modello `AmazonAccount` con credenziali cifrate, `amazonAccountId` su tutte le tabelle Amazon, contesto `AsyncLocalStorage` (`context/account-context.ts`) invece di threading esplicito. Vedi `docs/tech-debt.md` sezione F per dettagli, bug trovati (cache cross-account, race su auth in frontend) e chiusura di tutti i gap noti (NA region, join non compositi, selettore UI). **Multi Shopify-store resta da fare** (Shopify è ancora single-store, non toccato da questa migrazione — era pianificato come "v2.0.0" in `GIT_WORKFLOW.md`). Nessun modello `Organization`/multi-tenant a livello utenti: gli utenti (`User`) restano condivisi tra tutti gli account Amazon, non c'è ancora segregazione per organizzazione.
3. **Layer di payload raw** persistito separatamente dai dati normalizzati (oggi `AmazonOrder`/`ShopifyOrder` sono già "normalizzati", il payload originale non viene conservato).
4. **Marketplace come entità** (oggi è una stringa `IT`/`DE`/`FR`/`ES`/`ALL_EU` su ogni record).
5. Riconciliazione dei quirk documentati in `docs/tech-debt.md` sezione A (es. A.1 ordini cancellati trattati diversamente tra Shopify e Amazon, A.8 settlement non riconciliato automaticamente).
6. **Repository layer non rispettato nel dominio Amazon** (`docs/tech-debt.md` E.1): molte route/service in `amazon/**` chiamano Prisma direttamente invece di passare da `repositories/**`, contraddicendo la regola assoluta di `AGENTS.md`/`CONTRIBUTING.md`.

Non affrontare questi gap "di nascosto" dentro un task diverso: ognuno merita una branch e una PR dedicata, discussa prima con l'utente vista la sensibilità economica dei dati coinvolti.

## Documentazione obbligatoria

`README.md`, questo `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `GIT_WORKFLOW.md`, `DEPLOY_CHECKLIST.md`, `docs/PROJECT_SPEC.md`, `docs/phases/*`, `docs/tech-debt.md`, `docs/cd-evolution.md`, `docs/branch-protection.md`.

## Formato di risposta per ogni task

Per ogni task non banale, rispondi in questo formato:

1. **Analisi iniziale** — stato corrente verificato.
2. **Piano** — passi piccoli e ordinati.
3. **Branch** — nome proposto.
4. **File interessati** — elenco.
5. **Rischi** — database, regressioni, sicurezza, dati.
6. **Implementazione** — solo ciò che rientra nel task.
7. **Verifiche** — lint, typecheck (`tsc --noEmit`), test, build applicabili.
8. **Migrazioni** — migrazione + rollback, oppure "nessuna modifica database".
9. **Risultato** — cosa è stato realmente completato.
10. **Prossimo task consigliato** — un solo passo successivo, non eseguito automaticamente.

Per task banali (typo, piccola correzione isolata) questo formato può essere abbreviato, ma il ragionamento su rischi e migrazioni resta obbligatorio quando rilevante.

## In caso di dubbio

Se una situazione non è coperta da queste regole, da `CONTRIBUTING.md` o da `docs/PROJECT_SPEC.md`, fermati e chiedi. Non improvvisare su decisioni di processo o architettura — vale soprattutto per i gap della roadmap di adeguamento sopra.
