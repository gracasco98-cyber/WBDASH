#!/usr/bin/env bash
# =============================================================================
#  05-renew-ssl.sh — Renew TLS certificate via certbot webroot and reload nginx.
#  Add to crontab to run twice daily:
#
#    sudo crontab -e
#    0 3,15 * * * /opt/dashboard/app/scripts/05-renew-ssl.sh >> /var/log/certbot-renew.log 2>&1
#
#  Usage (from /opt/dashboard/app):
#    bash scripts/05-renew-ssl.sh
# =============================================================================
set -euo pipefail

DOMAIN="dashboard.example.com"
CERT_DIR="/opt/dashboard/certbot/conf"
WEBROOT="/opt/dashboard/certbot/www"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[$(date)] ==> Attempting certificate renewal..."

sudo certbot renew \
  --webroot \
  --webroot-path "${WEBROOT}" \
  --config-dir   "${CERT_DIR}" \
  --quiet \
  --deploy-hook "docker compose -f ${APP_DIR}/docker-compose.prod.yml exec -T nginx nginx -s reload"

echo "[$(date)] ==> Renewal check complete."
