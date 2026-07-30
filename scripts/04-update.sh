#!/usr/bin/env bash
# =============================================================================
#  04-update.sh — Pull latest code and redeploy with zero-downtime.
#  Run whenever you push a new version.
#
#  Usage (from /opt/dashboard/app):
#    bash scripts/04-update.sh
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest code..."
git pull --ff-only

echo "==> Building updated images..."
docker compose -f docker-compose.prod.yml build

echo "==> Restarting services (rolling — DB stays up)..."
# Restart backend first, then frontend, then nginx (DB is never stopped)
docker compose -f docker-compose.prod.yml up -d --no-deps backend
sleep 10
docker compose -f docker-compose.prod.yml up -d --no-deps frontend
sleep 10
docker compose -f docker-compose.prod.yml up -d --no-deps nginx

echo "==> Removing dangling images..."
docker image prune -f

echo "==> Service status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "==> Health check:"
sleep 5
curl -sf https://dashboard.example.com/health && echo " ✓ backend healthy" || echo " ✗ check logs"

echo ""
echo "==> Update complete."
