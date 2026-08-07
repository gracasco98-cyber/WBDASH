#!/bin/sh
set -e

echo "[Entrypoint] Applying database migrations..."
npx prisma migrate deploy

echo "[Entrypoint] Seeding master account (idempotent)..."
node dist/seed-admin.js

echo "[Entrypoint] Seeding initial Amazon account from env vars (idempotent)..."
node dist/seed-amazon-account.js

echo "[Entrypoint] Starting backend server..."
exec node dist/server.js
