# CD Evolution — Roadmap evoluzione del Continuous Deployment

> **Status:** Fuori scope per la revisione 2026-05-07. Questo file traccia il lavoro futuro.

Stato attuale (2026-05-07): deploy **manuale via SCP** dal PC dell'utente al server AWS Lightsail. La revisione introduce CI (GitHub Actions per test + typecheck + build), ma NON automatizza il deploy.

Questo file traccia i passi futuri per evolvere verso un CD automatizzato e sicuro.

---

## Step 1: GitHub Actions → SSH/SCP automatico

**Goal:** Al merge su `main` di una PR (CI verde), un workflow esegue automaticamente:
1. SSH al server Lightsail
2. SCP dei file backend/frontend modificati
3. Docker rebuild + restart container
4. Health check finale

**Cosa serve:**
- Secret GitHub: `LIGHTSAIL_SSH_KEY` (chiave privata SSH come secret cifrato)
- Secret GitHub: `LIGHTSAIL_HOST` (`YOUR_SERVER_IP`)
- Workflow `.github/workflows/deploy-prod.yml` con trigger `push: branches: [main]`
- Health check finale obbligatorio: se fallisce, alert via email/Slack
- Rollback: tag dell'immagine Docker precedente, comando manuale di restore (Step 2 lo automatizza)

**Rischi/considerazioni:**
- Esfiltrazione SSH key: usare `ssh-agent` con tempo di vita limitato.
- Race condition se due PR vengono mergiate ravvicinate: serializzare via `concurrency: group: deploy-prod`.
- Failure mid-deploy: il container resta in stato inconsistente. Mitigazione: deploy atomico via `docker compose up -d --no-deps <service>` solo dopo build verde.

---

## Step 2: Container registry (GHCR) con immagini immutabili

**Goal:** Sostituire SCP+rebuild on-server con immagini buildate in CI e pulled dal server.

**Vantaggi:**
- Build una volta, deploy ovunque.
- Rollback istantaneo: `docker compose pull <previous-tag> && docker compose up -d`.
- Audit trail: ogni immagine ha hash + tag + commit.

**Cosa serve:**
- Configurare GHCR (GitHub Container Registry) con package permissions per il repo.
- Workflow CI builda immagini `dashboard-backend:<sha>` e `dashboard-frontend:<sha>` e le push.
- `docker-compose.prod.yml` modificato per usare `image: ghcr.io/...:<tag>` invece di `build: ./backend`.
- Server pulla con: `docker compose pull && docker compose up -d`.

---

## Step 3: Blue-green deployment con rollback automatico

**Goal:** Deploy zero-downtime, rollback automatico se health check post-deploy fallisce.

**Approccio:**
- Due stack su `docker-compose.prod.yml` (`*-blue` e `*-green`).
- Nginx routing tra blue/green via env var `ACTIVE_STACK`.
- Workflow:
  1. Pull nuova immagine sullo stack inattivo.
  2. Avvia stack inattivo, esegui smoke test interno (curl health endpoint).
  3. Switch nginx a stack nuovo.
  4. Verifica esterna (curl https://...).
  5. Se OK: stop stack vecchio. Se KO: switch nginx indietro, alert.

**Cosa serve:**
- Riscrittura `docker-compose.prod.yml` con servizi duplicati.
- Script `scripts/blue-green-deploy.sh` orchestratore.
- Health endpoint robusto: `/health` deve ritornare 200 solo se DB connection + critical services sono up.

---

## Secrets management

In ordine di crescente sicurezza:

1. **Oggi:** secret in GitHub Actions secrets (sufficiente per Step 1).
2. **Migliore:** AWS Systems Manager Parameter Store, IAM role per il runner.
3. **Ottimale:** vault dedicato (HashiCorp Vault, AWS Secrets Manager con rotazione automatica).

Per Step 1 è sufficiente livello 1.

---

## Quando affrontare questi step

- **Step 1**: dopo che la revisione è completata e CI è stabile da almeno 2 settimane.
- **Step 2**: se la frequenza di deploy supera 1/giorno o se il rollback diventa frequente.
- **Step 3**: se ci sono utenti H24 e il downtime di restart container (~30s) è inaccettabile.

Niente di tutto questo è prioritario. Il deploy manuale è ok per ora.
