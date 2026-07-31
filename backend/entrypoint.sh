#!/bin/sh
set -e

echo "[Entrypoint] Applying database schema..."
# --accept-data-loss is safe here: the only "loss" is the ephemeral user_sessions
# table managed by connect-pg-simple (sessions are invalidated on every restart anyway)
npx prisma db push --skip-generate --accept-data-loss

echo "[Entrypoint] Seeding master account (idempotent)..."
node dist/seed-admin.js

echo "[Entrypoint] Seeding initial Amazon account from env vars (idempotent)..."
node dist/seed-amazon-account.js

echo "[Entrypoint] Starting backend server..."
exec node dist/server.js
