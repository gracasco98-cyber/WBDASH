#!/usr/bin/env bash
# =============================================================================
#  02-init-ssl.sh — Obtain the initial TLS certificate via certbot standalone.
#  Run this BEFORE starting the full production stack (ports 80/443 must be free).
#
#  Prerequisites:
#    - 01-server-setup.sh has run
#    - DNS A-record for dashboard.example.com points to this server's IP
#    - Ports 80 and 443 are open in the firewall
#
#  Usage (from /opt/dashboard/app):
#    bash scripts/02-init-ssl.sh
# =============================================================================
set -euo pipefail

DOMAIN="dashboard.example.com"
EMAIL="admin@example.com"
CERT_DIR="/opt/dashboard/certbot/conf"

# ── Install certbot if not present ────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "==> Installing certbot..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq certbot
fi

# ── Stop any running nginx/stack that might hold port 80 ─────────────────────
if docker compose -f docker-compose.prod.yml ps --services --filter status=running 2>/dev/null | grep -q nginx; then
  echo "==> Stopping nginx container to free port 80..."
  docker compose -f docker-compose.prod.yml stop nginx
fi

# ── Request certificate (standalone — certbot runs its own HTTP server) ───────
echo "==> Requesting certificate for ${DOMAIN}..."
sudo certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --domain "${DOMAIN}" \
  --cert-path    "${CERT_DIR}/live/${DOMAIN}/cert.pem" \
  --key-path     "${CERT_DIR}/live/${DOMAIN}/privkey.pem" \
  --fullchain-path "${CERT_DIR}/live/${DOMAIN}/fullchain.pem" \
  --chain-path   "${CERT_DIR}/live/${DOMAIN}/chain.pem" \
  --config-dir   "${CERT_DIR}"

echo ""
echo "==> Certificate obtained! Files are in ${CERT_DIR}/live/${DOMAIN}/"
echo ""
echo "==> NEXT STEP: Run scripts/03-start.sh to bring up the full stack."
