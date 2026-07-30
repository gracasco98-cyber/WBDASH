# WBDASH — Gestionale e Dashboard Vendite/Profitti

Dashboard multi-canale (Shopify + Amazon SP-API) per il monitoraggio di vendite, marginalità e operazioni. Questo repository è il punto di partenza reale della piattaforma gestionale descritta in [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md): non uno scaffold vuoto, ma un'applicazione già funzionante importata il 2026-07-30, che copre gran parte della [Fase 1 — Dashboard Vendite e Profitti](./docs/phases/PHASE_01_SALES_PROFIT.md).

**Prima di lavorare su questo repo, leggi in ordine**: [`CLAUDE.md`](./CLAUDE.md) (regole operative e stato reale del progetto), [`AGENTS.md`](./AGENTS.md) (contratto per agenti AI), [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md) (visione architetturale completa), [`docs/tech-debt.md`](./docs/tech-debt.md) (debiti tecnici noti).

---

## Stack

| Layer     | Tecnologia                         |
|-----------|-------------------------------------|
| Backend   | Node.js + TypeScript + Express      |
| Database  | PostgreSQL + Prisma ORM             |
| Frontend  | Next.js 14 + Tailwind CSS           |
| Charts    | Recharts                            |
| Real-time | Shopify Webhooks + Polling 60s, SSE per live feed |
| Amazon    | Selling Partner API (orders, ads, settlement, COGS, inventory, forecast) |

---

## Prerequisiti

- Node.js **≥ 18**
- PostgreSQL **≥ 14** in esecuzione
- Shopify Admin API token con permessi `read_orders`
- Credenziali Amazon SP-API (LWA + refresh token) per l'integrazione Amazon
- (Opzionale) ngrok per esporre i webhook Shopify in locale

---

## Installazione rapida

### 1. Backend

```bash
cd backend
cp .env.example .env
```

Configura in `.env`: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `DATABASE_URL`, credenziali Amazon SP-API (vedi `.env.example` per l'elenco completo).

```bash
npm install
npx prisma migrate dev --name init   # prima migrazione: lo schema non ha ancora storico versionato (vedi CLAUDE.md §Roadmap)
npm run dev                          # avvia il backend su :3001
```

Al primo avvio il backend può scaricare lo storico ordini (Shopify: ultimi 90 giorni; Amazon: intervallo configurabile).

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:3001

npm install
npm run dev                # avvia il frontend su :3000
```

Apri [http://localhost:3000](http://localhost:3000).

### 3. Amazon SP-API OAuth (setup iniziale, una tantum)

```bash
node amazon-auth.js <APPLICATION_ID>
```

Apre il browser sulla pagina di autorizzazione Amazon, riceve il callback in locale e scrive `AMAZON_EU_REFRESH_TOKEN` in `backend/.env`.

---

## Struttura del progetto

```
WBDASH/
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── amazon/            # SP-API: orders, ads, settlement, COGS, inventory, forecast
│       ├── auth/               # login, sessioni, MFA
│       ├── services/           # Shopify: client GraphQL, normalizzazione ordini
│       ├── repositories/       # unico punto di accesso a Prisma
│       ├── jobs/               # sync storico + polling
│       ├── webhooks/           # handler webhook Shopify
│       ├── routes/             # API REST dashboard
│       ├── chat/               # tool-calling OpenAI sui dati dashboard
│       └── sse/                # server-sent events (live feed)
│
├── frontend/
│   └── src/
│       ├── app/                # pagine (dashboard, /amazon/**, /admin, /login, /account)
│       ├── components/         # dashboard/, amazon/, auth/, products/, layout/
│       ├── hooks/               # useCrossChannelData, usePaymentsData, useSSE, ecc.
│       └── lib/                 # client API tipizzato, formatters, config marketplace
│
├── docs/
│   ├── PROJECT_SPEC.md         # architettura e visione completa WBDASH
│   ├── phases/                 # spec per fase (Release 1, future)
│   ├── tech-debt.md            # debiti tecnici noti
│   ├── cd-evolution.md
│   └── branch-protection.md
│
├── nginx/, scripts/, docker-compose*.yml   # infrastruttura e deploy
├── CLAUDE.md, AGENTS.md, CONTRIBUTING.md, GIT_WORKFLOW.md, DEPLOY_CHECKLIST.md
└── amazon-auth.js               # helper OAuth SP-API
```

---

## Configurazione Shopify Webhook (opzionale ma consigliato)

I webhook garantiscono aggiornamenti istantanei. Senza di essi il polling ogni 60s è comunque attivo.

In locale con ngrok: `ngrok http 3001`, poi in Shopify Admin → Impostazioni → Notifiche → Webhook, aggiungi `orders/create`, `orders/updated`, `orders/cancelled` puntando a `https://TUO-DOMINIO/webhooks/shopify` (API version 2025-01). Copia il secret in `SHOPIFY_WEBHOOK_SECRET` nel `.env` del backend.

---

## Come personalizzare il mapping Tag → Marketplace (Shopify)

Apri `backend/src/config/marketplace-rules.ts`. Ogni regola ha `name`, `displayName`, `priority`, `color`, `tagPatterns`, `sourceNames`, `channelNames`. Priorità di detection: Tag → sourceName → channelDisplayName → `UNCLASSIFIED`. Dopo la modifica riavvia il backend; per riclassificare ordini esistenti usa Admin → Sync completo.

---

## API Backend (estratto)

| Endpoint | Descrizione |
|----------|-------------|
| `GET /api/stats/summary?filter=today&marketplace=all` | KPI aggregati Shopify |
| `GET /api/stats/timeseries?filter=today&bucket=minute` | Serie temporale |
| `GET /api/stats/orders` | Lista ordini paginata |
| `GET /api/stats/sync-status` / `POST /api/stats/sync?full=true` | Stato/lancio sync Shopify |
| `POST /webhooks/shopify` | Webhook Shopify |
| `backend/src/amazon/routes/**` | Ordini, ads, settlement, COGS, inventory, forecast Amazon (vedi `AGENTS.md` per la mappa completa) |

---

## Deploy

Vedi [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) per la procedura completa e [`CLAUDE.md`](./CLAUDE.md) per i dettagli infrastruttura (server, container, rete Docker). Deploy manuale via SCP, solo da `main`, solo dopo CI verde e PR mergiata — il server di produzione non ha git installato.

---

## Troubleshooting

**Ordini UNCLASSIFIED troppi (Shopify)?** → Admin → Testa rilevamento → incolla i tag reali → aggiorna `marketplace-rules.ts`.

**Sync lento al primo avvio?** → Normale, paginazione da 50. Aspetta il log `[Sync] Historical sync complete`.

**Webhook 401?** → Controlla `SHOPIFY_WEBHOOK_SECRET`. Vuoto = skip verifica HMAC in sviluppo.

**Database connection error?** → Verifica `DATABASE_URL` e che PostgreSQL sia raggiungibile. Riesegui le migrazioni con `npx prisma migrate dev`.
