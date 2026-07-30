# AGENTS.md — Regole per agenti AI sulla codebase WBDASH

Questo file è il **contratto operativo** per ogni agente AI (Claude Code, Copilot, agenti futuri) che opera su questa codebase. Le regole qui sono **vincolanti** quanto le regole umane in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Le 3 regole d'oro (mai violare)

1. **Niente push diretti su `main`.** Tutti i cambiamenti passano da PR su `develop`. `main` è produzione.
2. **Niente deploy senza CI verde.** Se un workflow CI fallisce, il deploy non si fa, punto. Indagare e correggere prima.
3. **Niente accesso diretto a Prisma fuori da `backend/src/repositories/`.** Le route, i service, i webhook, i job NON chiamano `prisma.X.findY()` — usano sempre il repository layer.

> ⚠️ **Convention-based, non enforced.** Questa repo è privata su GitHub Free, dove la branch protection automatica **non è disponibile**. Non c'è un gate GitHub che blocca le violazioni — è la disciplina dell'agente che fa il lavoro. Vedi [`docs/branch-protection.md`](./docs/branch-protection.md) per dettagli.
>
> Una violazione delle regole qui è un **bug grave** quanto un test che fallisce: pretende un fix immediato.

---

## Riferimenti vincolanti

Prima di qualsiasi modifica, leggere e rispettare:

- [`CLAUDE.md`](./CLAUDE.md) — istruzioni Claude Code-specifiche, stack reale, principi non negoziabili, roadmap di adeguamento
- [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md) — architettura e visione completa WBDASH
- [`docs/phases/PHASE_01_SALES_PROFIT.md`](./docs/phases/PHASE_01_SALES_PROFIT.md) — cosa è già fatto e cosa manca per la Release 1
- [`docs/tech-debt.md`](./docs/tech-debt.md) — bug/quirk noti lockati nei test, file sopra i limiti di dimensione
- [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md) — branching strategy e commit convention
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — regole tecniche di contribuzione

> Nota: questo progetto (importato il 2026-07-30 in WBDASH) aveva in precedenza una cartella `docs/superpowers/` con spec e roadmap di una revisione sistematica (PR 6–18). Quei file **non sono stati inclusi** nell'export ricevuto — se servono per capire il "perché" di una scelta architetturale non altrimenti spiegata, chiedi all'utente prima di assumere.

---

## Cosa l'agente DEVE fare

- **Sempre creare branch** seguendo la convention (`feature/*`, `fix/*`, `refactor/*`, `chore/*`, `test/*`, `migration/*`, `hotfix/*`, `release/*`).
- **Sempre aprire PR su `develop`** (non `main`).
- **Sempre eseguire test rilevanti localmente** prima di pushare. Backend: `cd backend && npm run test`. Frontend: `cd frontend && npm run test`.
- **Sempre type-check** prima di pushare: `cd backend && npx tsc --noEmit` e `cd frontend && npx tsc --noEmit`.
- **Sempre limitare la dimensione delle PR**: target ≤500 LOC diff. Se superi, motivare esplicitamente nella PR description.
- **Sempre aggiornare `docs/tech-debt.md`** se scopri un nuovo debito tecnico o quirk mentre lavori, invece di ignorarlo o farlo sparire silenziosamente.

## Cosa l'agente NON DEVE fare

- ❌ Push diretti su `main` o `develop` (sempre via PR).
- ❌ Force push (`--force`, `--force-with-lease`) su branch condivisi.
- ❌ Skippare hook git (`--no-verify`) o GPG signing (`--no-gpg-sign`).
- ❌ Modifiche allo schema Prisma (`backend/prisma/schema.prisma`) senza migration committata e approvazione esplicita dell'utente.
- ❌ Aggiungere `new PrismaClient()` dove non esiste già — usare il singleton (`import { prisma } from "../db"`).
- ❌ Chiamate dirette a Prisma fuori da `backend/src/repositories/`.
- ❌ Deploy manuale via SCP senza prima aver verificato che la PR sia mergiata su `main` con CI verde.
- ❌ Inserire credenziali, token, o secret in commit (anche temporaneamente, anche con piano di rimuoverli dopo).
- ❌ "Fixare" silenziosamente un quirk documentato in `docs/tech-debt.md` sezione A: sono comportamenti lockati nei test, il cambio va discusso prima (impatta calcoli economici reali).

---

## Punti di ingresso del codice (dove guardare per cosa)

| Dominio | Backend | Frontend |
|---|---|---|
| Shopify orders & sync | `backend/src/services/shopify.service.ts`, `backend/src/services/order.service.ts`, `backend/src/jobs/sync.job.ts`, `backend/src/webhooks/webhooks.ts` | `frontend/src/components/dashboard/ShopifyBIOverview.tsx` |
| Amazon (orders, ads, settlement, COGS, inventory, forecast) | `backend/src/amazon/**` | `frontend/src/app/amazon/**` |
| Auth / MFA / RBAC | `backend/src/auth/**`, `backend/src/middleware/auth.middleware.ts` | `frontend/src/lib/auth.ts`, `frontend/src/app/login/**`, `frontend/src/app/account/**` |
| Analytics / KPI cross-channel | `backend/src/routes/stats.routes.ts`, `backend/src/routes/analytics.routes.ts` | `frontend/src/components/dashboard/CrossChannelProducts.tsx`, `frontend/src/components/dashboard/SellerboardKpiCards.tsx` |
| Detection marketplace (Shopify) | `backend/src/config/marketplace-rules.ts` | `frontend/src/lib/marketplaces.ts`, `frontend/src/lib/marketplace-rules-client.ts` |
| Repository layer DB | `backend/src/repositories/**` | n/a |
| Chat AI su dati dashboard | `backend/src/chat/tools.ts`, `backend/src/routes/chat.routes.ts` | `frontend/src/components/ChatWidget.tsx` |

---

## Convenzione hook (Claude Code, plugin AI)

Se un agente o plugin scrive un hook in `settings.json` o file equivalente:

- **SEMPRE quotare le espansioni di variabili d'ambiente** che possono contenere spazi:
  - ❌ `python3 ${CLAUDE_PLUGIN_ROOT}/hooks/script.py`
  - ✅ `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/script.py"`
- Su Windows con profilo utente che contiene spazi (es. `C:\Users\youruser\`), il quoting è **obbligatorio**: senza, la shell splitta il path e Python riceve un argomento mutilato.
- Vale per ogni env var espansa: `$HOME`, `$USER_PROFILE`, `${ANY_PATH}`, ecc.

---

## In caso di dubbio

Se una situazione non è coperta da queste regole o da [`CONTRIBUTING.md`](./CONTRIBUTING.md), fermati e chiedi. Non improvvisare su decisioni di processo o architettura.
