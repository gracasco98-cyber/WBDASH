# CONTRIBUTING.md — Regole tecniche di contribuzione

Linee guida per umani che modificano la codebase My Dashboard.

---

## TL;DR

1. Branch da `develop`, PR su `develop`. Mai push su `main`.
2. Una PR = uno scopo, ≤500 LOC.
3. Niente Prisma chiamato direttamente: solo via `backend/src/repositories/`.
4. Test scritti per ogni nuova feature o bug fix non triviale.
5. CI verde è obbligatoria per il merge.

> ⚠️ **Queste regole sono enforced solo dalla disciplina del team.** GitHub Free su repo private non supporta branch protection: nessun gate automatico blocca un push diretto su `main` o un merge senza CI verde. Trattare le regole come vincolanti comunque — vedi [`docs/branch-protection.md`](./docs/branch-protection.md) per dettagli e per i comandi di attivazione enforcement quando si passa a Pro/public.

---

## Branching

Convention prefissi:

| Prefix | Per |
|---|---|
| `feature/<descrizione-kebab>` | Nuove funzionalità utente-visibili |
| `fix/<descrizione-kebab>` | Bug fix |
| `refactor/<descrizione-kebab>` | Refactoring senza cambi funzionali |
| `chore/<descrizione-kebab>` | Config, dipendenze, build, doc |
| `test/<descrizione-kebab>` | Solo aggiunta/modifica test |

Workflow standard:

```bash
git checkout develop && git pull
git checkout -b refactor/extract-shopify-repo
# ... lavora, committa ...
git push -u origin refactor/extract-shopify-repo
gh pr create --base develop
```

Quando `develop` è stabile, una PR `develop → main` chiude un ciclo di release.

---

## Pull Request

### Dimensione

- **Target ≤500 LOC diff** (incluso codice di test).
- Se sfori, motiva nella PR description.
- Per eccezioni più aggressive (>1000 LOC), aggiungi label `large-pr-approved` e un secondo reviewer.

### Descrizione PR

Template minimo:

```markdown
## Summary
- 1-3 bullet del cambiamento

## Test plan
- [ ] Test scritti
- [ ] CI verde
- [ ] Smoke test manuale (se UI)
- [ ] Roadmap aggiornata (se PR della revisione)
```

### Review

- Almeno 1 reviewer per PR di refactor o feature non triviali.
- Per `chore/` puramente di config: self-merge ok dopo CI verde.

---

## Commit message convention

Già definita in [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md). Sintesi: `type(scope): descrizione breve`.

---

## Limiti dimensione file (soft)

- Route file: ≤400 LOC
- Componente React: ≤300 LOC
- Service: ≤500 LOC
- Page Next.js: ≤300 LOC (preferire orchestrazione + sotto-componenti)

Eccezioni motivate vanno spiegate nella PR description. Se il file che stai modificando è già oltre il limite, non sei obbligato a refactorarlo nella tua PR — apri un issue o un task in `docs/tech-debt.md`.

---

## Accesso al database

**Regola assoluta:** dopo PR 12 della revisione, le route, i service, i webhook, e i job NON chiamano Prisma direttamente.

❌ Non così:

```ts
// backend/src/routes/stats.routes.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

router.get("/orders", async (req, res) => {
  const orders = await prisma.shopifyOrder.findMany({ where: {...} });
  res.json(orders);
});
```

✅ Così:

```ts
// backend/src/repositories/shopify/orders.repo.ts
import { PrismaClient } from "@prisma/client";
import type { ShopifyOrder } from "../../types/domain";

export async function findByDateRange(
  prisma: PrismaClient,
  params: { from: Date; to: Date }
): Promise<ShopifyOrder[]> {
  return prisma.shopifyOrder.findMany({
    where: { createdAt: { gte: params.from, lte: params.to } },
    orderBy: { createdAt: "desc" },
  });
}

// backend/src/routes/stats.routes.ts
import { prisma } from "../db";
import { findByDateRange } from "../repositories/shopify/orders.repo";

router.get("/orders", async (req, res) => {
  const orders = await findByDateRange(prisma, { from, to });
  res.json(orders);
});
```

Regole del repository layer:
1. Una funzione = una operazione DB (lettura o scrittura).
2. `PrismaClient` come primo parametro (dependency injection).
3. Solo accesso dati: niente business logic.
4. Type-safe: tipi dominio, niente leak di tipi Prisma.

---

## Schema DB

Modifiche a `backend/prisma/schema.prisma`:
1. Crea migration: `npx prisma migrate dev --name <descrizione>`
2. Committa la migration insieme alla modifica dello schema.
3. **Approvazione esplicita di un secondo reviewer** prima del merge.
4. Verifica che la migration sia idempotente e applicabile su prod (rollback plan).

---

## Testing

Ogni PR di feature o fix non triviale richiede test:

- **Unit test**: per logica pura (formatters, parser, calcoli, regole di detection).
- **Integration test**: per repository, route, sync job. Usa `@testcontainers/postgresql` per Postgres reale.
- **Mock API esterne**: usa MSW (Mock Service Worker) per Shopify GraphQL, Amazon SP-API, Ads API.

Comandi:

```bash
# Backend
cd backend && npm run test

# Frontend
cd frontend && npm run test
```

Test che falliscono = PR bloccata in CI.

---

## TypeScript check

Prima di pushare:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Errori di tipo bloccano la CI.

---

## Roadmap della revisione

Se la tua PR fa parte della revisione sistematica, dopo il merge:
1. Aggiorna [`docs/superpowers/plans/2026-05-07-revision-roadmap.md`](./docs/superpowers/plans/2026-05-07-revision-roadmap.md):
   - Stato della PR: ☐ → ✅
   - Link PR popolato
2. Aggiungi entry nell'`## Update log` in fondo.

---

## In caso di dubbio

Quando una decisione di processo o architettura non è coperta qui o nella spec, **fermati e chiedi** prima di procedere. Meglio una domanda in più che un debito tecnico in più.
