# Deploy Checklist — dashboard.example.com

## Phase 1 — AWS Lightsail: Create the instance

- [ ] Go to AWS Lightsail → **Create instance**
  - Platform: **Linux/Unix**
  - Blueprint: **Ubuntu 24.04 LTS**
  - Plan: **$10/mo (2 GB RAM, 1 vCPU, 60 GB SSD)** — minimum for this stack
    (upgrade to $20 if you notice slowness after a few weeks of data)
  - Instance name: `dashboard-app`
- [ ] Assign a **static IP** to the instance (Networking → Static IPs → Attach)
  - Note the static IP: `___________________`
- [ ] In Lightsail **Firewall rules**, ensure these ports are open:
  - SSH (22)
  - HTTP (80)
  - HTTPS (443)

---

## Phase 2 — DNS

- [ ] In your DNS provider (e.g., Cloudflare, GoDaddy), create:
  - **A record**: `dashboard.example.com` → `<static IP>`
  - TTL: 60 seconds (speed up propagation)
- [ ] Wait for DNS to propagate and verify:
  ```bash
  dig +short dashboard.example.com
  # Should return your Lightsail static IP
  ```

---

## Phase 3 — Server setup

SSH into the instance:
```bash
ssh ubuntu@<static-IP>
```

- [ ] Run the server setup script:
  ```bash
  # From your local machine, send the script and run it
  scp scripts/01-server-setup.sh ubuntu@<IP>:~/
  ssh ubuntu@<IP> 'bash ~/01-server-setup.sh'
  ```
- [ ] **Log out and back in** so the `docker` group takes effect:
  ```bash
  exit
  ssh ubuntu@<IP>
  docker ps   # should work without sudo
  ```

---

## Phase 4 — Deploy the application files

From your **local machine** (in the project root):

- [ ] Copy the project (excluding dev artifacts):
  ```bash
  rsync -az --progress \
    --exclude node_modules \
    --exclude .git \
    --exclude '*.log' \
    ./ ubuntu@<IP>:/opt/dashboard/app/
  ```

- [ ] Copy the Excel file:
  ```bash
  scp "PAGAMENTI AMAZON.xlsx" ubuntu@<IP>:/opt/dashboard/data/pagamenti-amazon.xlsx
  ```

- [ ] SSH in and create the `.env` file:
  ```bash
  ssh ubuntu@<IP>
  cd /opt/dashboard/app
  cp .env.production.example .env
  nano .env
  ```
  Fill in every `CHANGE_ME` value:
  - `DB_PASSWORD` — generate: `openssl rand -hex 32`
  - `SESSION_SECRET` — generate: `openssl rand -hex 32`
  - `MASTER_PASSWORD` — your admin password (e.g., `Nuvole12!`)
  - `SHOPIFY_ADMIN_TOKEN` — from Shopify Admin
  - `OPENAI_API_KEY` — from OpenAI
  - `AMAZON_LWA_CLIENT_SECRET` — from Amazon Developer Console
  - `AMAZON_EU_REFRESH_TOKEN` — from SP-API auth
  - `AMAZON_ADVERTISING_*` — from Advertising Console

---

## Phase 5 — TLS certificate

- [ ] Ensure nothing is running on port 80:
  ```bash
  sudo ss -tlnp | grep :80
  ```
- [ ] Run the SSL init script:
  ```bash
  cd /opt/dashboard/app
  bash scripts/02-init-ssl.sh
  ```
- [ ] Verify certificate was issued:
  ```bash
  ls /opt/dashboard/certbot/conf/live/dashboard.example.com/
  # Should show: cert.pem  chain.pem  fullchain.pem  privkey.pem
  ```

---

## Phase 6 — Start the stack

- [ ] Start all services:
  ```bash
  cd /opt/dashboard/app
  bash scripts/03-start.sh
  ```
- [ ] Watch the logs for errors:
  ```bash
  docker compose -f docker-compose.prod.yml logs -f
  ```
- [ ] Verify backend seeding:
  ```bash
  docker compose -f docker-compose.prod.yml logs backend | grep -E "(Seeding|Starting|Entrypoint)"
  # Should see: [Entrypoint] Seeding master account (idempotent)...
  ```

---

## Phase 7 — Smoke tests

- [ ] HTTPS works: `curl -I https://dashboard.example.com`
- [ ] HTTP redirects: `curl -I http://dashboard.example.com` → `301 → https://`
- [ ] Health endpoint: `curl https://dashboard.example.com/health` → `{"ok":true,...}`
- [ ] Login page loads: open `https://dashboard.example.com/login` in browser
- [ ] Login with `admin@example.com` + your `MASTER_PASSWORD`
- [ ] Dashboard data loads (Shopify overview numbers appear)
- [ ] Amazon section loads (may show 0 until backfill runs)
- [ ] SSL grade: check at `https://www.ssllabs.com/ssltest/` — should be **A+**

---

## Phase 8 — Post-deploy setup

- [ ] **SSL auto-renewal cron** (run as root):
  ```bash
  sudo crontab -e
  # Add this line:
  0 3,15 * * * /opt/dashboard/app/scripts/05-renew-ssl.sh >> /var/log/certbot-renew.log 2>&1
  ```
- [ ] **Amazon backfill** — trigger from the dashboard Sync Center:
  - Go to `https://dashboard.example.com/amazon/sync`
  - Click **Avvia Backfill** → 90 days → **Conferma**
  - Monitor progress in the sync jobs table
- [ ] **Shopify webhook** (optional — for live order updates):
  - In Shopify Admin → Settings → Notifications → Webhooks
  - Add webhook: `https://dashboard.example.com/webhooks/shopify`
  - Set `SHOPIFY_WEBHOOK_SECRET` in `.env` and restart backend
- [ ] **Shopify `fulfillments/create` webhook** — **required** if `MIRAKL_API_KEY` is set (not optional):
  - Register it as a **separate** webhook subscription, topic `fulfillments/create`,
    same endpoint `https://dashboard.example.com/webhooks/shopify` (API version 2025-01)
  - Without it the Shopify → Mirakl tracking sync never fires: shipments are never
    pushed back to Mirakl (OR23/OR24), so the Redcare shipping SLA is silently missed

---

## Phase 9 — Ongoing maintenance

### Deploy a new version
```bash
# On server, from /opt/dashboard/app:
bash scripts/04-update.sh
```

### View live logs
```bash
docker compose -f docker-compose.prod.yml logs -f [backend|frontend|nginx]
```

### Database backup
```bash
docker exec dashboard-db pg_dump -U postgres shopify_dashboard | \
  gzip > /opt/dashboard/backup-$(date +%Y%m%d-%H%M).sql.gz
```

### Restart a single service
```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Check SSL certificate expiry
```bash
sudo certbot certificates
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `502 Bad Gateway` | `docker compose -f docker-compose.prod.yml logs backend` |
| Login fails / 401 | `SESSION_SECRET` set in `.env`? Container restarted after env change? |
| SSL cert missing | `ls /opt/dashboard/certbot/conf/live/dashboard.example.com/` — run `02-init-ssl.sh` again |
| Amazon data empty | Check backfill job status in Sync Center |
| Out of disk space | `docker system prune -af && docker volume prune -f` (careful: deletes stopped containers) |
| DB corrupt | Restore from backup: `gunzip -c backup.sql.gz \| docker exec -i dashboard-db psql -U postgres shopify_dashboard` |
