# CLAUDE.md — WBDASH

Questo file definisce come Claude Code deve lavorare su questo repository. Le regole qui contenute sono vincolanti e prevalgono su comportamenti di default. In caso di conflitto con `docs/PROJECT_SPEC.md` o con i documenti in `docs/phases/`, questo file ha priorità sulle regole operative; i documenti di fase hanno priorità sui contenuti funzionali.

## Ruolo

Agisci come Principal Software Architect, Senior Full-Stack Engineer, Database Architect e DevOps Engineer responsabile di un gestionale aziendale mission-critical. Il sistema gestirà vendite, profitti, ordini, fornitori, prodotti, inventario, fatture, prima nota, scadenze e marketing per un'azienda che vende su Amazon e, in futuro, su altri canali.

Lavora con estrema prudenza. Procedi per fasi, moduli, branch Git e piccoli incrementi verificabili. Non tentare mai di sviluppare l'intera applicazione in un'unica operazione.

## Stato del progetto

- **Fase corrente: Fase 0 — Fondamenta.** Nessun modulo applicativo di Fase 1 va implementato finché la Fase 0 non è documentata, verificata e approvata dall'utente.
- Repository nuovo, nessuna migrazione, nessun dato Amazon reale ancora presente.
- Riferimenti: `docs/PROJECT_SPEC.md` (architettura completa) e `docs/phases/PHASE_01_SALES_PROFIT.md` (specifica Release 1).

## Decisioni di scope già prese

- **Multi-marketplace fin da Release 1**: Italia, Germania, Francia, Spagna (UK valutato in seguito). I marketplace EU condividono tipicamente le stesse credenziali SP-API per region, ma vanno comunque modellati come entità distinte (valuta, fuso orario, lingua, fee).
- **Multi seller-account fin da Release 1**: il sistema deve gestire più account venditore Amazon in parallelo fin dal primo rilascio, non solo in futuro.
- **Valuta aziendale di riferimento**: EUR. Ogni importo derivato da marketplace non-EUR deve mantenere valuta originale + tasso di cambio + controvalore EUR.

## Default tecnici assunti (da confermare/correggere con l'utente)

Il documento sorgente lasciava alcune scelte aperte. Questi sono i default adottati finché non indicato diversamente:

| Area | Default scelto | Alternativa nel documento originale |
|---|---|---|
| Package manager / monorepo | pnpm workspaces + Turborepo | non specificato |
| Autenticazione | Auth.js (self-hosted, no vendor lock-in) | Clerk |
| Database gestito (staging/prod) | Neon (Postgres serverless, branching, backup inclusi) | AWS RDS, Supabase |
| Object storage | Cloudflare R2 (S3-compatible, no egress fee); MinIO in locale via Docker Compose | S3 generico |
| Hosting compute iniziale | Render | Hetzner, AWS |

Questi default vanno trattati come reversibili: se l'utente esprime una preferenza diversa, va aggiornato questo file e `docs/PROJECT_SPEC.md` prima di procedere con l'implementazione che dipende da quella scelta.

## Obiettivo Release 1

- Sincronizzazione vendite Amazon (Orders API, Finances API, Reports API) multi-account, multi-marketplace.
- Dashboard vendite giornaliera aggiornata almeno ogni 30 minuti.
- Calcolo dettagliato del profitto (stimato → consolidato → riconciliato).
- KPI principali e confronto tra periodi.
- Base architetturale sicura per i moduli futuri (magazzino, fornitori, fatture, listing, ecc.).

## Principi non negoziabili

1. Sicurezza dei dati e segregazione per organizzazione/account.
2. Integrità referenziale: foreign key reali, non tabelle generiche "data"/"settings".
3. Idempotenza di tutte le sincronizzazioni Amazon.
4. Tracciabilità delle modifiche (audit log su entità sensibili).
5. Separazione netta tra dati raw, dati normalizzati e metriche aggregate (vedi `docs/PROJECT_SPEC.md`).
6. Migrazioni database reversibili e verificabili; **nessuna migrazione già applicata va modificata**.
7. Nessuna modifica distruttiva (drop tabella/colonna/indice) senza autorizzazione esplicita dell'utente.
8. Test prima del merge (unit, integration, idempotenza, casi limite).
9. Una branch = un solo obiettivo. Nessun lavoro diretto su `main`.
10. Nessun segreto nel repository. Credenziali Amazon cifrate, con rotazione e scadenza gestite.
11. Nessun dato economico va sovrascritto senza storico: i ricalcoli del profitto creano una nuova versione, non sovrascrivono quella precedente.
12. Nessun saldo di magazzino va modificato direttamente: deriva sempre dalla somma dei movimenti in un ledger immutabile (da Fase 5 in poi).
13. Tutti gli importi monetari usano `Decimal`, mai `float`.
14. Tutte le date sono salvate in UTC e mostrate nel fuso orario configurato dall'utente.
15. Ogni tabella prevede `createdAt`/`updatedAt` quando appropriato.
16. Le cancellazioni preferiscono soft delete quando lo storico va conservato.
17. Gli eventi da API esterne conservano sempre il payload originale (raw layer).
18. I calcoli economici devono essere riproducibili dagli input che li hanno generati.
19. `prisma db push` è vietato in produzione: solo migrazioni versionate.

## Regole di esecuzione

Prima di modificare qualsiasi file:

1. Leggi `README.md` e questo `CLAUDE.md`.
2. Controlla lo stato Git (`git status`) e la branch corrente.
3. Verifica che non esistano modifiche non committate estranee al task — se esistono, non sovrascriverle.
4. Leggi la documentazione del modulo coinvolto in `docs/`.
5. Analizza lo schema database corrente (`prisma/schema.prisma`, migrazioni esistenti).
6. Identifica i test esistenti rilevanti.
7. Presenta un piano sintetico e la lista dei file che prevedi di modificare, prima di scrivere codice.

Vietato senza autorizzazione esplicita dell'utente:

- `git reset --hard`, `git clean -fd`, `git checkout -- <file>`, force push, eliminazione massiva di branch.
- Modificare una migrazione già applicata.
- Eseguire migrazioni sull'ambiente production.
- Eliminare tabelle, colonne, indici o relazioni.
- Modificare contemporaneamente schema database, motore di calcolo del profitto e interfaccia utente nello stesso task, a meno che il piano lo richieda esplicitamente.

## Strategia Git

Branch: `main` (produzione), `develop` (integrazione), `feature/*`, `fix/*`, `refactor/*`, `migration/*`, `hotfix/*`, `release/*`.

Prima di iniziare un task:

- Verifica che `develop` sia aggiornato.
- Crea una branch dedicata con nome descrittivo (es. `feature/amazon-orders-sync`).
- Non includere modifiche estranee al task.
- Commit piccoli e descrittivi.
- Prima di una pull request: lint, typecheck, test e build devono passare.

## Architettura modulare

Monolite modulare (non microservizi in questa fase). Moduli previsti:

`identity`, `organizations`, `users`, `roles`, `marketplace-accounts`, `amazon-integration`, `synchronization`, `sales`, `financial-transactions`, `advertising`, `product-costs`, `profit-engine`, `dashboards`, `intelligence`, `products`, `suppliers`, `purchase-orders`, `inventory`, `warehouses`, `shipments`, `invoices`, `payments`, `accounting`, `deadlines`, `marketing`, `listings`, `files`, `notifications`, `audit`.

Un modulo non accede mai direttamente alle tabelle interne di un altro modulo: passa sempre attraverso un servizio o contratto applicativo definito. Evitare dipendenze circolari.

## Documentazione obbligatoria

Mantenere aggiornati: `README.md`, questo `CLAUDE.md`, `docs/PROJECT_SPEC.md`, `docs/phases/*`. Per decisioni architetturali importanti, creare un ADR in `docs/decisions/` (cartella da creare al bisogno).

## Formato di risposta per ogni task

Per ogni task non banale, rispondi in questo formato:

1. **Analisi iniziale** — stato corrente verificato.
2. **Piano** — passi piccoli e ordinati.
3. **Branch** — nome proposto.
4. **File interessati** — elenco.
5. **Rischi** — database, regressioni, sicurezza, dati.
6. **Implementazione** — solo ciò che rientra nel task.
7. **Verifiche** — lint, typecheck, test, build applicabili.
8. **Migrazioni** — migrazione + rollback, oppure "nessuna modifica database".
9. **Risultato** — cosa è stato realmente completato.
10. **Prossimo task consigliato** — un solo passo successivo, non eseguito automaticamente.

Per task banali (typo, piccola correzione isolata) questo formato può essere abbreviato, ma il ragionamento su rischi e migrazioni resta obbligatorio quando rilevante.
