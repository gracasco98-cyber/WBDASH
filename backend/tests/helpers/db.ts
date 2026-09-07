import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { convertDecimalsDeep } from '../../src/utils/decimal';
import { encryptSecret } from '../../src/utils/crypto';

export interface TestDb {
  prisma: PrismaClient;
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Avvia un container Postgres effimero per i test, applica lo schema Prisma,
 * restituisce un PrismaClient connesso e una funzione di cleanup.
 *
 * Uso tipico (in test integration):
 *
 *   let db: TestDb;
 *   beforeAll(async () => { db = await setupTestDb(); });
 *   afterAll(async () => { await db.cleanup(); });
 *   beforeEach(async () => { await truncateAll(db.prisma); });
 */
export async function setupTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('shopify_dashboard_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const databaseUrl = container.getConnectionUri();

  // Apply the real, versioned migrations (never `db push`) — `db push` syncs
  // the test DB directly from schema.prisma, which is NOT what dev/prod run.
  // A migration whose SQL has drifted from schema.prisma (wrong column type,
  // missing constraint, ...) passes every test under `db push` because the
  // test DB never sees the drifted SQL at all — it gets the schema's
  // (correct) shape instead. `migrate deploy` applies the actual
  // migration.sql files in order, so the test DB's schema is byte-for-byte
  // what a real deploy produces, closing that blind spot.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: process.env.TEST_VERBOSE ? 'inherit' : 'ignore',
  });

  // Same Decimal→number conversion as backend/src/db.ts (see comment there):
  // without it, every monetary field read through this client comes back as
  // Prisma.Decimal, and `expect(row.totalAmount).toBe(450)` fails even when
  // the value is numerically correct (Decimal fails strict/Object.is
  // equality against a plain number).
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  }).$extends({
    query: {
      $allOperations({ args, query }) {
        return query(args).then((result) => convertDecimalsDeep(result));
      },
    },
  }) as unknown as PrismaClient;

  await prisma.$connect();

  return {
    prisma,
    container,
    databaseUrl,
    cleanup: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}

/**
 * Crea un AmazonAccount minimo per i test (multi-account migration, 2026-07-31).
 * `sellerId` è @unique quindi generato random per evitare collisioni tra test.
 * NOTA: truncateAll() cancella anche AmazonAccount (CASCADE) — va richiamato
 * dentro beforeEach DOPO truncateAll, non in beforeAll, altrimenti il primo
 * truncateAll del test successivo lo cancella e ogni FK amazonAccountId
 * successivo punterebbe a un record inesistente.
 */
export async function createTestAmazonAccount(
  prisma: PrismaClient,
  overrides?: {
    name?: string;
    sellerId?: string;
    region?: string;
    // Credential overrides (plaintext in — encrypted at rest, mirrors
    // repositories/amazon/accounts.repo.ts's createAccount() params).
    // Requires process.env.CREDENTIALS_ENCRYPTION_KEY to be set (tests/setup.ts
    // sets a fixed test key at module load time).
    lwaClientId?: string;
    lwaClientSecret?: string;
    spApiRefreshToken?: string;
    adsClientId?: string;
    adsClientSecret?: string;
    adsRefreshToken?: string;
    adsProfileIds?: Record<string, string>;
  }
): Promise<string> {
  const account = await prisma.amazonAccount.create({
    data: {
      name: overrides?.name ?? 'Test Account',
      sellerId: overrides?.sellerId ?? `TEST-SELLER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      region: overrides?.region ?? 'EU',
      lwaClientId: overrides?.lwaClientId ?? null,
      lwaClientSecretEnc: overrides?.lwaClientSecret ? encryptSecret(overrides.lwaClientSecret) : null,
      spApiRefreshTokenEnc: overrides?.spApiRefreshToken ? encryptSecret(overrides.spApiRefreshToken) : null,
      adsClientId: overrides?.adsClientId ?? null,
      adsClientSecretEnc: overrides?.adsClientSecret ? encryptSecret(overrides.adsClientSecret) : null,
      adsRefreshTokenEnc: overrides?.adsRefreshToken ? encryptSecret(overrides.adsRefreshToken) : null,
      adsProfileIds: overrides?.adsProfileIds ?? undefined,
    },
  });
  return account.id;
}

/**
 * Truncate aggressivo di tutte le tabelle. Da chiamare in beforeEach
 * per garantire isolation tra test.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations';
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
}
