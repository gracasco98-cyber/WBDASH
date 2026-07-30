#!/usr/bin/env bash
# =============================================================================
#  03-start.sh — Build images and start the full production stack.
#  Run after 02-init-ssl.sh has obtained the TLS certificate.
#
#  Usage (from /opt/dashboard/app):
#    bash scripts/03-start.sh
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Checking .env..."
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and fill in all values."
  exit 1
fi

# Verify no placeholder values remain
if grep -q "CHANGE_ME" .env; then
  echo "ERROR: .env still contains CHANGE_ME placeholders. Fill in all values first."
  grep "CHANGE_ME" .env | grep -v "^#"
  exit 1
fi

echo "==> Building Docker images (this may take a few minutes)..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "==> Starting all services..."
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for services to become healthy..."
sleep 15

echo "==> Service status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "==> Health check:"
curl -sf https://dashboard.example.com/health && echo " ✓ backend healthy" || echo " ✗ backend not reachable yet (may still be starting)"

echo ""
echo "==> Stack is up. Dashboard: https://dashboard.example.com"
echo "==> View logs: docker compose -f docker-compose.prod.yml logs -f"
