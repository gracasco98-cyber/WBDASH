# Connect Amazon Ads (PPC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach real Amazon Advertising API credentials (security profile "Naturplan") to the existing `AmazonAccount` "Account EU Principale" (sellerId `A1UX7E7RRSY5UK`), fixing a per-account/global-env inconsistency bug along the way, so the already-built Ads reporting code can reach Amazon for real.

**Architecture:** A repository-layer update function encrypts and stores the new credentials; a token-service fix makes the `Amazon-Advertising-API-ClientId` header use the same per-account value as the token itself (today it wrongly reads a global env var); a one-off backend script (`railway run`-able) writes the credentials to production and immediately verifies them with a live Amazon API call; a local Node script drives the one-time OAuth browser consent and prints that one-off script's command, pre-filled, ready to paste.

**Tech Stack:** Node.js/TypeScript (backend, existing `amazon/**` module), Prisma, Vitest + Testcontainers (existing pattern), plain Node.js (root-level OAuth helper script, no dependencies, mirrors existing `amazon-auth.js`).

## Global Constraints

- Repository layer only: only `backend/src/repositories/**` calls Prisma directly — `accounts.repo.ts` is the only file in this plan that imports `PrismaClient`/`prisma` for reads/writes of `AmazonAccount`.
- Credentials at rest are always encrypted via `encryptSecret()`/`decryptSecret()` (`backend/src/utils/crypto.ts`, AES-256-GCM) — never store `adsClientSecret`/`adsRefreshToken` in plaintext.
- No new database migration in this plan — the `adsClientId`/`adsClientSecretEnc`/`adsRefreshTokenEnc`/`adsProfileIds` columns already exist on `AmazonAccount`.
- No new HTTP route is added — writing production Ads credentials happens only via the one-off script run through `railway run`, with the user's explicit go-ahead at execution time (never run automatically).
- OAuth constants (exact values, from the approved design): authorize URL `https://eu.account.amazon.com/ap/oa`, scope `advertising::campaign_management`, redirect URI `http://localhost:9000/callback` (already registered by the user on the "Naturplan" security profile's Web Settings), token exchange endpoint `https://api.amazon.com/auth/o2/token` (same LWA endpoint already used for SP-API, see `backend/src/amazon/config.ts`'s `TOKEN_ENDPOINT`), profile discovery endpoint `https://advertising-api-eu.amazon.com/v2/profiles`.
- Env var names for the one-off script's inputs follow the naming already established in `backend/src/seed-amazon-account.ts`: `AMAZON_ADVERTISING_CLIENT_ID`, `AMAZON_ADVERTISING_CLIENT_SECRET`, `AMAZON_SELLER_ID` (read by the local helper script from `.env`, never committed).
- `backend/src/amazon/ads-api.service.ts` is already ~592 LOC, over the repo's soft 500-LOC service limit (`CLAUDE.md`) — this plan adds a handful of lines to existing functions and does not split the file; that split is out of scope here per `CLAUDE.md`'s "non sei obbligato a refactorare se non è nello scope".
- Test isolation: repository tests use the existing Testcontainers helper (`backend/tests/helpers/db.ts`, `setupTestDb`/`truncateAll`/`createTestAmazonAccount`); unit tests for pure logic (`token.service.ts`) use `vi.mock` for `../db`, `../context/account-context`, and `../repositories/amazon/accounts.repo` — no real database needed there.

---

### Task 1: Repository layer — `updateAdsCredentials()`

**Files:**
- Modify: `backend/src/repositories/amazon/accounts.repo.ts`
- Test: `backend/tests/repositories/amazon/accounts.repo.test.ts` (new file)

**Interfaces:**
- Produces: `updateAdsCredentials(prisma: PrismaClient, accountId: string, params: UpdateAdsCredentialsParams): Promise<AmazonAccount>` where `UpdateAdsCredentialsParams = { adsClientId: string; adsClientSecret: string; adsRefreshToken: string; adsProfileIds: Record<string, string> }`. Throws (Prisma's `P2025`) if `accountId` does not exist.
- Consumes: `encryptSecret` (already imported in this file from `../../utils/crypto`), `AmazonAccount`/`PrismaClient` types (already imported).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/repositories/amazon/accounts.repo.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, truncateAll, createTestAmazonAccount, type TestDb } from "../../helpers/db";
import { updateAdsCredentials, getAccountCredentials } from "../../../src/repositories/amazon/accounts.repo";

let db: TestDb;

beforeAll(async () => { db = await setupTestDb(); }, 60_000);
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await truncateAll(db.prisma); });

describe("accounts.repo — updateAdsCredentials", () => {
  it("encrypts and stores ads credentials on an existing account", async () => {
    const accountId = await createTestAmazonAccount(db.prisma, { name: "EU Test", sellerId: "SELLER-ADS-1" });

    await updateAdsCredentials(db.prisma, accountId, {
      adsClientId: "amzn1.application-oa2-client.test",
      adsClientSecret: "super-secret-value",
      adsRefreshToken: "Atzr|refresh-token-value",
      adsProfileIds: { IT: "111", DE: "222" },
    });

    const creds = await getAccountCredentials(db.prisma, accountId);
    expect(creds.adsClientId).toBe("amzn1.application-oa2-client.test");
    expect(creds.adsClientSecret).toBe("super-secret-value");
    expect(creds.adsRefreshToken).toBe("Atzr|refresh-token-value");
    expect(creds.adsProfileIds).toEqual({ IT: "111", DE: "222" });
  });

  it("stores ciphertext, not plaintext, for the secret fields", async () => {
    const accountId = await createTestAmazonAccount(db.prisma, { name: "EU Test 2", sellerId: "SELLER-ADS-2" });
    await updateAdsCredentials(db.prisma, accountId, {
      adsClientId: "client-id",
      adsClientSecret: "plaintext-secret",
      adsRefreshToken: "plaintext-refresh",
      adsProfileIds: {},
    });
    const row = await db.prisma.amazonAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.adsClientSecretEnc).not.toBe("plaintext-secret");
    expect(row.adsClientSecretEnc).toContain(":"); // iv:authTag:ciphertext format
    expect(row.adsRefreshTokenEnc).not.toBe("plaintext-refresh");
  });

  it("throws when the account does not exist", async () => {
    await expect(updateAdsCredentials(db.prisma, "00000000-0000-0000-0000-000000000000", {
      adsClientId: "x", adsClientSecret: "y", adsRefreshToken: "z", adsProfileIds: {},
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/repositories/amazon/accounts.repo.test.ts`
Expected: FAIL — `updateAdsCredentials` is not exported from `accounts.repo.ts`.

- [ ] **Step 3: Implement `updateAdsCredentials()`**

Append to `backend/src/repositories/amazon/accounts.repo.ts` (after the existing `createAccount` function, end of file):

```ts
export interface UpdateAdsCredentialsParams {
  adsClientId: string;
  adsClientSecret: string;
  adsRefreshToken: string;
  adsProfileIds: Record<string, string>;
}

/** Update the Advertising API credentials on an existing account, encrypting the secret and refresh token. Throws if the account does not exist. */
export async function updateAdsCredentials(
  prisma: PrismaClient,
  accountId: string,
  params: UpdateAdsCredentialsParams
): Promise<AmazonAccount> {
  return prisma.amazonAccount.update({
    where: { id: accountId },
    data: {
      adsClientId: params.adsClientId,
      adsClientSecretEnc: encryptSecret(params.adsClientSecret),
      adsRefreshTokenEnc: encryptSecret(params.adsRefreshToken),
      adsProfileIds: params.adsProfileIds,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/repositories/amazon/accounts.repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/amazon/accounts.repo.ts backend/tests/repositories/amazon/accounts.repo.test.ts
git commit -m "feat(amazon): add updateAdsCredentials repository function"
```

---

### Task 2: Token service — `getAdsClientId()`

**Files:**
- Modify: `backend/src/amazon/token.service.ts`
- Test: `backend/tests/amazon/token.service.test.ts` (new file)

**Interfaces:**
- Consumes: `getAccountCredentials` (already imported in `token.service.ts`), `getCurrentAccountId` (already imported).
- Produces: `getAdsClientId(): Promise<string>` — returns `creds.adsClientId ?? creds.lwaClientId` for the current account (same fallback formula `getAdsApiToken()` already uses for the refresh token), cached per account, cache cleared by the existing `invalidateTokens()`. Throws if neither is set.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/amazon/token.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/db", () => ({ prisma: {} }));
vi.mock("../../src/context/account-context", () => ({
  getCurrentAccountId: vi.fn(() => "account-1"),
}));
const getAccountCredentials = vi.fn();
vi.mock("../../src/repositories/amazon/accounts.repo", () => ({
  getAccountCredentials: (...args: any[]) => getAccountCredentials(...args),
}));

import { getAdsClientId, invalidateTokens } from "../../src/amazon/token.service";

describe("getAdsClientId", () => {
  beforeEach(() => {
    getAccountCredentials.mockReset();
    invalidateTokens(); // clear cache from any previous test (same mocked account id)
  });

  it("returns adsClientId when set on the account", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: "ads-client", lwaClientId: "sp-client" });
    expect(await getAdsClientId()).toBe("ads-client");
  });

  it("falls back to lwaClientId when adsClientId is not set", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: null, lwaClientId: "sp-client" });
    expect(await getAdsClientId()).toBe("sp-client");
  });

  it("caches the result across calls", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: "ads-client", lwaClientId: null });
    await getAdsClientId();
    await getAdsClientId();
    expect(getAccountCredentials).toHaveBeenCalledTimes(1);
  });

  it("throws when neither adsClientId nor lwaClientId is set", async () => {
    getAccountCredentials.mockResolvedValue({ adsClientId: null, lwaClientId: null });
    await expect(getAdsClientId()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/amazon/token.service.test.ts`
Expected: FAIL — `getAdsClientId` is not exported from `token.service.ts`.

- [ ] **Step 3: Implement `getAdsClientId()`**

In `backend/src/amazon/token.service.ts`, add a new cache map next to the existing ones (after line 22, `const adsApiCacheByAccount = new Map<string, CachedToken>();`):

```ts
const adsClientIdCacheByAccount = new Map<string, string>();
```

Add the function after `getAdsApiToken()` (after its closing brace, before `invalidateTokens()`):

```ts
/** Get the Advertising API Client ID for the current account (cached), same fallback formula getAdsApiToken() uses for the refresh token. */
export async function getAdsClientId(): Promise<string> {
  const accountId = getCurrentAccountId();
  const cached = adsClientIdCacheByAccount.get(accountId);
  if (cached) return cached;

  const creds = await getAccountCredentials(prisma, accountId);
  const clientId = creds.adsClientId ?? creds.lwaClientId;
  if (!clientId) {
    throw new Error(`[Amazon] AmazonAccount ${accountId} is missing an Advertising API Client ID`);
  }
  adsClientIdCacheByAccount.set(accountId, clientId);
  return clientId;
}
```

Update `invalidateTokens()` to also clear this cache (add one line inside the existing function):

```ts
export function invalidateTokens(): void {
  const accountId = getCurrentAccountId();
  spApiCacheByAccount.delete(accountId);
  spApiCacheNAByAccount.delete(accountId);
  adsApiCacheByAccount.delete(accountId);
  adsClientIdCacheByAccount.delete(accountId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/amazon/token.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/amazon/token.service.ts backend/tests/amazon/token.service.test.ts
git commit -m "feat(amazon): add getAdsClientId to token service"
```

---

### Task 3: Fix `ads-api.service.ts` to use the per-account Ads Client ID

**Files:**
- Modify: `backend/src/amazon/ads-api.service.ts`
- Modify: `backend/tests/amazon/ads-api.service.test.ts` (existing file — its `token.service` mock needs the new export)

**Interfaces:**
- Consumes: `getAdsClientId()` from Task 2 (`./token.service`).
- Produces: no new exports — every function that builds an `Amazon-Advertising-API-ClientId` header now sources it from `getAdsClientId()` instead of the removed env-based `ADS_CLIENT_ID()`.

- [ ] **Step 1: Update the existing test's mock (this is the "failing test" step — it fails once Step 3 removes the env fallback the current mock relies on)**

In `backend/tests/amazon/ads-api.service.test.ts`, change the `token.service` mock (lines 5-8) from:

```ts
vi.mock("../../src/amazon/token.service", () => ({
  getAdsApiToken: vi.fn(async () => "fake-token"),
  invalidateTokens: vi.fn(),
}));
```

to:

```ts
vi.mock("../../src/amazon/token.service", () => ({
  getAdsApiToken: vi.fn(async () => "fake-token"),
  getAdsClientId: vi.fn(async () => "fake-client-id"),
  invalidateTokens: vi.fn(),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/amazon/ads-api.service.test.ts`
Expected: FAIL — `ads-api.service.ts` still imports/calls the now-absent `ADS_CLIENT_ID()` (the mock replaces the whole module, so the real env-reading function is gone — TypeScript/runtime error on import or on the `ADS_CLIENT_ID()` call).

- [ ] **Step 3: Fix `ads-api.service.ts`**

Change the import (line 9) from:

```ts
import { getAdsApiToken, invalidateTokens } from "./token.service";
```

to:

```ts
import { getAdsApiToken, getAdsClientId, invalidateTokens } from "./token.service";
```

Remove the env-based client ID function (lines 16-17):

```ts
const ADS_CLIENT_ID = () =>
  process.env.AMAZON_ADVERTISING_CLIENT_ID || process.env.AMAZON_LWA_CLIENT_ID || "";
```

In `adsRequest()`, change:

```ts
async function adsRequest(
  method: string,
  path: string,
  profileId: string,
  body?: any
): Promise<any> {
  const token = await getAdsApiToken();
  const ct = method === "POST" ? spContentType(path) : "application/json";

  const headers: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    ct,
    Accept:                            ct,
  };
```

to:

```ts
async function adsRequest(
  method: string,
  path: string,
  profileId: string,
  body?: any
): Promise<any> {
  const [token, clientId] = await Promise.all([getAdsApiToken(), getAdsClientId()]);
  const ct = method === "POST" ? spContentType(path) : "application/json";

  const headers: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    ct,
    Accept:                            ct,
  };
```

In `listProfiles()`, change:

```ts
export async function listProfiles(): Promise<AdsProfileInfo[]> {
  const token = await getAdsApiToken();
  const res = await fetch(`${ADS_ENDPOINT}/v2/profiles`, {
    headers: {
      "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
```

to:

```ts
export async function listProfiles(): Promise<AdsProfileInfo[]> {
  const [token, clientId] = await Promise.all([getAdsApiToken(), getAdsClientId()]);
  const res = await fetch(`${ADS_ENDPOINT}/v2/profiles`, {
    headers: {
      "Amazon-Advertising-API-ClientId": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
```

In `fetchSPCampaignReport()`, change:

```ts
  const end = endDate ?? startDate;
  const token = await getAdsApiToken();
  const reportHeaders: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    "application/json",
    Accept:                            "application/json",
  };
```

to (this exact block appears once, inside `fetchSPCampaignReport`):

```ts
  const end = endDate ?? startDate;
  const [token, clientId] = await Promise.all([getAdsApiToken(), getAdsClientId()]);
  const reportHeaders: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization:                     `Bearer ${token}`,
    "Content-Type":                    "application/json",
    Accept:                            "application/json",
  };
```

In `fetchSPAdvertisedProductReport()`, change:

```ts
  const end = endDate ?? startDate;
  const token = await getAdsApiToken();
  const hdrs: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": ADS_CLIENT_ID(),
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };
```

to (this exact block appears in `fetchSPAdvertisedProductReport`):

```ts
  const end = endDate ?? startDate;
  const [token, clientId] = await Promise.all([getAdsApiToken(), getAdsClientId()]);
  const hdrs: Record<string, string> = {
    "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope":    profileId,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };
```

The identical-looking block also appears in `fetchSPKeywordReport()` — apply the same `const token = await getAdsApiToken();` → `const [token, clientId] = await Promise.all([getAdsApiToken(), getAdsClientId()]);` and `ADS_CLIENT_ID()` → `clientId` there too (its `hdrs` object is otherwise identical to the one above).

And in `fetchSPSearchTermReport()` — same change again (its `hdrs` object is also identical in shape).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/amazon/ads-api.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole backend (this task touches 5 functions across the file — a targeted grep won't catch a missed call site, but the compiler will)**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. If any `ADS_CLIENT_ID` reference remains (grep for it to be sure: `grep -n "ADS_CLIENT_ID" backend/src/amazon/ads-api.service.ts` should return nothing), fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/amazon/ads-api.service.ts backend/tests/amazon/ads-api.service.test.ts
git commit -m "fix(amazon): use per-account Ads Client ID instead of global env var"
```

---

### Task 4: One-off script to write and verify production Ads credentials

**Files:**
- Create: `backend/src/scripts/set-ads-credentials.ts`
- Modify: `backend/package.json` (add npm script)

**Interfaces:**
- Consumes: `findActiveAccounts`, `updateAdsCredentials` (Task 1, `../repositories/amazon/accounts.repo`), `runWithAccount` (`../context/account-context`), `listProfiles` (`../amazon/ads-api.service`), `prisma` (`../db`).
- Produces: no exports consumed elsewhere — this is a CLI entrypoint, invoked via `npm run set-ads-credentials -- <flags>` (typically wrapped in `railway run` against production).

This script has no automated test — it is a thin, imperative orchestration of already-tested functions (`updateAdsCredentials` from Task 1, `listProfiles` already covered by existing tests), consistent with the untested `seed-amazon-account.ts` already in this codebase. Its real verification is the live Amazon API call it makes internally, run manually against production in Task 5's final step.

- [ ] **Step 1: Write the script**

Create `backend/src/scripts/set-ads-credentials.ts`:

```ts
// set-ads-credentials.ts — One-off: attach real Advertising API credentials
// to an existing AmazonAccount (found by sellerId), then immediately verify
// them with a live GET /v2/profiles call. Companion to the local
// amazon-ads-auth.js OAuth helper (repo root), which prints the exact
// command to run this with.
// Run via: railway run npm run --prefix backend set-ads-credentials -- \
//   --sellerId='A1UX7E7RRSY5UK' --clientId='...' --clientSecret='...' \
//   --refreshToken='...' --profileIds='{"IT":"123"}'
import { prisma } from "../db";
import { findActiveAccounts, updateAdsCredentials } from "../repositories/amazon/accounts.repo";
import { runWithAccount } from "../context/account-context";
import { listProfiles } from "../amazon/ads-api.service";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=([\s\S]*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { sellerId, clientId, clientSecret, refreshToken, profileIds } = args;

  if (!sellerId || !clientId || !clientSecret || !refreshToken) {
    console.error(
      "Usage: set-ads-credentials --sellerId=... --clientId=... --clientSecret=... --refreshToken=... [--profileIds='{\"IT\":\"123\"}']"
    );
    process.exit(1);
  }

  const accounts = await findActiveAccounts(prisma);
  const account = accounts.find((a) => a.sellerId === sellerId);
  if (!account) {
    console.error(`No active AmazonAccount found with sellerId ${sellerId}`);
    process.exit(1);
  }

  const parsedProfileIds = profileIds ? JSON.parse(profileIds) : {};

  await updateAdsCredentials(prisma, account.id, {
    adsClientId: clientId,
    adsClientSecret: clientSecret,
    adsRefreshToken: refreshToken,
    adsProfileIds: parsedProfileIds,
  });

  console.log(
    `[set-ads-credentials] Saved Ads credentials for "${account.name}" (${account.id}), ` +
    `${Object.keys(parsedProfileIds).length} profile(s) configured.`
  );

  console.log("[set-ads-credentials] Verifying with a live GET /v2/profiles call...");
  await runWithAccount(account.id, async () => {
    const liveProfiles = await listProfiles();
    console.log(`[set-ads-credentials] Live verification OK — Amazon returned ${liveProfiles.length} profile(s):`);
    console.log(liveProfiles.map((p) => `  ${p.marketplace}: profileId=${p.profileId}`).join("\n"));
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[set-ads-credentials] Failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `backend/package.json`, in the `"scripts"` block, add a line next to the existing `"seed:products"` entry:

```json
    "set-ads-credentials": "ts-node src/scripts/set-ads-credentials.ts",
```

- [ ] **Step 3: Verify the script builds and reports usage correctly on missing args**

Run: `cd backend && npx ts-node src/scripts/set-ads-credentials.ts`
Expected: prints the `Usage: set-ads-credentials ...` line and exits with code 1 (no crash/stack trace — confirms the file compiles and `parseArgs` behaves correctly with no arguments).

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/set-ads-credentials.ts backend/package.json
git commit -m "feat(amazon): add set-ads-credentials one-off script"
```

---

### Task 5: Local OAuth helper — `amazon-ads-auth.js`

**Files:**
- Create: `amazon-ads-auth.js` (repo root)

**Interfaces:**
- Consumes: `.env` values `AMAZON_ADVERTISING_CLIENT_ID`, `AMAZON_ADVERTISING_CLIENT_SECRET`, `AMAZON_SELLER_ID` (read directly from the local `.env` file, same pattern as `amazon-auth.js`).
- Produces: nothing importable — a standalone script run with `node amazon-ads-auth.js`. Its final output is a ready-to-run shell command (printed to the terminal, never written to a file) that invokes Task 4's script via `railway run`.

No automated test for this file — it is a local, interactive, browser-driving OAuth helper (same as the existing untested `amazon-auth.js`). Its correctness is verified in Step 2 by actually running the full consent flow against the real "Naturplan" security profile.

- [ ] **Step 1: Write the script**

Create `amazon-ads-auth.js` at the repo root:

```js
/**
 * Amazon Advertising API OAuth Helper
 * ────────────────────────────────────
 * Uso: node amazon-ads-auth.js
 *
 * 1. Legge AMAZON_ADVERTISING_CLIENT_ID / AMAZON_ADVERTISING_CLIENT_SECRET / AMAZON_SELLER_ID dal file .env
 * 2. Apre il browser sulla pagina di consenso Amazon Ads (profilo "Naturplan")
 * 3. Riceve il callback su http://localhost:9000/callback
 * 4. Scambia il codice con un refresh_token
 * 5. Scopre automaticamente i profileId Ads via GET /v2/profiles
 * 6. Stampa il comando `railway run` pronto da incollare per salvare tutto sull'account di produzione
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const url = require("url");

// ─── Leggi .env ────────────────────────────────────────────────────────────────
const ENV_FILE = path.join(__dirname, ".env");

function readEnv() {
  const env = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

// ─── Config ────────────────────────────────────────────────────────────────────
const env = readEnv();
const CLIENT_ID     = env.AMAZON_ADVERTISING_CLIENT_ID;
const CLIENT_SECRET = env.AMAZON_ADVERTISING_CLIENT_SECRET;
const SELLER_ID     = env.AMAZON_SELLER_ID;
const PORT          = 9000;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌  AMAZON_ADVERTISING_CLIENT_ID o AMAZON_ADVERTISING_CLIENT_SECRET mancanti nel file .env!\n");
  process.exit(1);
}

if (!SELLER_ID) {
  console.error("\n❌  AMAZON_SELLER_ID mancante nel file .env! Serve per generare il comando finale.\n");
  process.exit(1);
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

// ─── Costruisci URL di consenso (endpoint EU) ───────────────────────────────────
const STATE = Math.random().toString(36).substring(2, 10);
const AUTH_URL =
  `https://eu.account.amazon.com/ap/oa` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&scope=advertising::campaign_management` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${STATE}`;

// ─── Scambia authorization code con refresh_token ─────────────────────────────
function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString();

    const options = {
      hostname: "api.amazon.com",
      path:     "/auth/o2/token",
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.refresh_token) resolve(json);
          else reject(new Error(JSON.stringify(json)));
        } catch (e) {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Scopri i profileId Ads (GET /v2/profiles) ─────────────────────────────────
function listProfiles(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "advertising-api-eu.amazon.com",
      path:     "/v2/profiles",
      method:   "GET",
      headers: {
        "Amazon-Advertising-API-ClientId": CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const profiles = JSON.parse(data);
          if (!Array.isArray(profiles)) return reject(new Error(data));
          const map = {};
          for (const p of profiles) {
            if (p.accountInfo && p.accountInfo.type === "seller" && p.countryCode) {
              map[p.countryCode] = String(p.profileId);
            }
          }
          resolve(map);
        } catch (e) {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ─── Server locale per il callback ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname !== "/callback") {
    res.writeHead(404);
    return res.end("Not found");
  }

  const { code, error } = parsed.query;

  const html = (title, body, isError = false) => `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8"/>
      <title>Amazon Ads Auth Helper</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e4e4e7; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px; max-width: 720px; width: 90%; }
        h1 { margin: 0 0 16px; font-size: 22px; color: ${isError ? "#f87171" : "#6ee7b7"}; }
        p { color: #a1a1aa; line-height: 1.6; }
        pre { background: #0a0a0f; border: 1px solid #1e1e2e; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 12px; color: #6ee7b7; white-space: pre-wrap; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        ${body}
      </div>
    </body>
    </html>
  `;

  if (error) {
    console.error(`\n❌  Amazon ha restituito un errore: ${error}`);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Errore autorizzazione", `<p>Amazon ha restituito: <code>${error}</code></p>`, true));
    setTimeout(() => server.close(), 2000);
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Nessun codice ricevuto", "<p>Amazon non ha inviato nessun codice.</p>", true));
    return;
  }

  console.log("\n🔄  Codice ricevuto, scambio con refresh_token...");

  try {
    const tokens = await exchangeCode(String(code));
    const refreshToken = tokens.refresh_token;
    console.log("\n✅  Refresh token ottenuto.");

    console.log("\n🔍  Scoperta profili Ads (GET /v2/profiles)...");
    const profileIds = await listProfiles(tokens.access_token);
    console.log(`\n✅  Profili trovati: ${JSON.stringify(profileIds)}`);

    const command =
      `railway run npm run --prefix backend set-ads-credentials -- ` +
      `--sellerId=${shQuote(SELLER_ID)} --clientId=${shQuote(CLIENT_ID)} --clientSecret=${shQuote(CLIENT_SECRET)} ` +
      `--refreshToken=${shQuote(refreshToken)} --profileIds=${shQuote(JSON.stringify(profileIds))}`;

    console.log("\n📋  Comando pronto — copialo ed eseguilo per salvare tutto sull'account di produzione:\n");
    console.log(command);
    console.log("");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "✅ Autorizzazione completata!",
      `<p>Refresh token e profili Ads ottenuti. Il comando da eseguire nel terminale è stato stampato lì (contiene segreti, non viene ripetuto qui).</p>
       <p>Profili trovati:</p><pre>${JSON.stringify(profileIds, null, 2)}</pre>`
    ));
  } catch (err) {
    console.error("\n❌  Errore:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Errore", `<pre>${err.message}</pre>`, true));
  }

  setTimeout(() => server.close(), 3000);
});

// ─── Avvia ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log("\n─────────────────────────────────────────────────");
  console.log(" Amazon Advertising API OAuth Helper");
  console.log("─────────────────────────────────────────────────");
  console.log(`\n📌  Client ID:      ${CLIENT_ID.substring(0, 40)}...`);
  console.log(`📌  Redirect URI:   ${REDIRECT_URI}`);
  console.log("\n⚠️   IMPORTANTE: assicurati che questo redirect URI sia registrato");
  console.log("    in Web Settings del profilo di sicurezza Ads su developer.amazon.com\n");
  console.log("🌐  Apertura browser per autorizzazione Amazon Ads...");
  console.log(`\n⏳  In attesa del callback su ${REDIRECT_URI} ...\n`);

  exec(`open "${AUTH_URL}"`, (err) => {
    if (err) {
      console.log("\n⚠️   Browser non aperto automaticamente. Apri manualmente questo URL:\n");
      console.log(`    ${AUTH_URL}\n`);
    }
  });
});

server.on("error", (err) => {
  console.error(`\n❌  Errore server: ${err.message}`);
  console.error(`    Assicurati che la porta ${PORT} sia libera.\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Manual end-to-end verification (this is the real test for this task)**

1. Add to the local (never committed) `.env`: `AMAZON_ADVERTISING_CLIENT_ID`, `AMAZON_ADVERTISING_CLIENT_SECRET` (the "Naturplan" security profile values), and confirm `AMAZON_SELLER_ID=A1UX7E7RRSY5UK` is already set.
2. Run: `node amazon-ads-auth.js`
3. Complete the Amazon consent screen in the browser that opens.
4. Confirm the terminal prints "✅ Profili trovati" with at least one marketplace, then the `railway run ...` command.
5. **Stop here and confirm with the user before running the printed command** — it writes real credentials to the production database (per `CLAUDE.md` rule: no production DB writes without explicit confirmation).
6. On confirmation, run the printed command. Confirm it prints `[set-ads-credentials] Live verification OK` with at least one profile — this is the end-to-end proof the credentials work.

- [ ] **Step 3: Commit**

```bash
git add amazon-ads-auth.js
git commit -m "feat(amazon): add local OAuth helper for Advertising API consent"
```

---

## Self-Review Notes

- Spec coverage: §2 (bug fix) → Task 2+3; §3.1-3.4 (components) → Tasks 1, 2, 3, 4, 5 respectively; §4 (data flow) → Task 5 Step 2 walks it end-to-end; §5 (testing) → Tasks 1 and 2 have Testcontainers/unit tests, Task 4's script is verified live in Task 5 Step 2 exactly as the design specifies ("unico modo per validare un'integrazione esterna"); §6 (risks) → explicit confirmation gate in Task 5 Step 2.
- No placeholders: every step has complete, exact code — no "similar to above" left unresolved (the two truly identical `hdrs` blocks in `fetchSPKeywordReport`/`fetchSPSearchTermReport` are called out explicitly rather than re-pasted twice more, since they are byte-identical to the one already shown for `fetchSPAdvertisedProductReport`).
- Type consistency checked: `UpdateAdsCredentialsParams` (Task 1) matches the object shape passed to it in Task 4's `set-ads-credentials.ts`; `getAdsClientId()` (Task 2) matches every call site added in Task 3.
