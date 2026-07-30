# ── Stage 1: build TypeScript ──────────────────────────────────────────────────
FROM node:18-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:18-alpine
RUN apk add --no-cache openssl curl
WORKDIR /app

COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma      ./prisma
COPY --from=builder /app/package.json ./package.json
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
