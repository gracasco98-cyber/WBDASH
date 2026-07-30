# Branch Protection — convention-based (no enforcement)

> **Stato**: questa repo è **private su GitHub Free**, e la branch protection per repo private richiede **GitHub Pro/Team/Enterprise** (~$4/mese/utente). Tentato di applicarla via `gh api` come admin (`youruser`); GitHub ha risposto **HTTP 403 — "Upgrade to GitHub Pro or make this repository public"**.
>
> **Decisione**: lavoriamo per convenzione, non per enforcement automatico.

Le regole sotto sono **vincolanti** quanto se fossero attive su GitHub. La differenza è che il rispetto dipende dalla disciplina di chi opera sulla repo (umani + agenti), non da un gate automatico.

I file [`AGENTS.md`](../AGENTS.md) e [`CONTRIBUTING.md`](../CONTRIBUTING.md) elencano queste regole come obblighi di processo per agenti e umani rispettivamente.

---

## Le regole (da rispettare a mano)

### Su `main`

- ✅ **Niente push diretti**: ogni cambiamento passa via PR su `develop`, poi `develop → main` per release.
- ✅ **Niente force push** (`git push --force` o `--force-with-lease` su `main`).
- ✅ **Niente eliminazione** del branch `main`.
- ☐ **Required approvals**: 0 per ora (alziamo a 1 quando il team cresce).
- ⏳ **Required status checks**: i workflow `ci-backend`, `ci-frontend`, `pr-quality` (creati in PR 3) **devono essere verdi** prima di mergiare. Lo verifichiamo a mano leggendo i Checks della PR su GitHub.

### Su `develop`

Identico a `main`, ma `develop` può ricevere PR direttamente dai branch `feature/*`, `fix/*`, `refactor/*`, `chore/*`, `test/*`.

### Naming convention dei branch

| Prefix | Per |
|---|---|
| `feature/` | Nuove funzionalità |
| `fix/` | Bug fix |
| `refactor/` | Refactoring senza cambi funzionali |
| `chore/` | Config, dipendenze, build, doc |
| `test/` | Aggiunta/modifica solo test |

---

## Cosa serve per attivare l'enforcement (futuro)

Se la repo dovesse diventare pubblica, oppure se si passa a **GitHub Pro / Team**, l'enforcement automatico si attiva con i comandi seguenti (da eseguire come admin del repo).

### Step 1: protezione base (PR required, no force push, no deletions)

```bash
# Su main
gh api -X PUT "repos/youruser/dashboard/branches/main/protection" \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF

# Stesso comando per develop:
gh api -X PUT "repos/youruser/dashboard/branches/develop/protection" \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
```

### Step 2: aggiungere required status checks (dopo PR 3 della roadmap)

Quando i workflow `ci-backend.yml`, `ci-frontend.yml`, `pr-quality.yml` esistono e hanno girato almeno una volta, aggiornare la protection:

```bash
gh api -X PUT "repos/youruser/dashboard/branches/main/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci-backend", "ci-frontend", "pr-quality"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

# stesso comando per develop
```

### Step 3: aumentare i required approvals (quando il team cresce)

```bash
gh api -X PUT "repos/youruser/dashboard/branches/main/protection" \
  -F required_pull_request_reviews='{"required_approving_review_count":1}'
```

---

## Verificare lo stato corrente

```bash
gh api "repos/youruser/dashboard/branches/main/protection" 2>&1
gh api "repos/youruser/dashboard/branches/develop/protection" 2>&1
```

Su Free tier private oggi: HTTP 403. Quando si passa a Pro/public: HTTP 200 con la config.

---

## Repository Rulesets — alternativa potenziale

GitHub ha introdotto i **Repository Rulesets** (più recenti delle branch protection rules legacy). Alcune funzionalità sono disponibili anche su Free tier per repo private, ma con copertura ridotta. Da valutare in futuro come alternativa più economica all'upgrade Pro.

Riferimento: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets>
