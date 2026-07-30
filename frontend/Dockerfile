# ── Stage 1: build Next.js ─────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_ vars are baked in at build time
ARG NEXT_PUBLIC_API_URL=http://192.168.1.43:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:18-alpine
RUN apk add --no-cache curl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/.next         ./.next
COPY --from=builder /app/public        ./public

EXPOSE 3000
CMD ["npm", "run", "start"]
