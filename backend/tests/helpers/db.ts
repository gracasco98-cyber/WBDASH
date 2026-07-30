import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

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

  // Applica schema Prisma
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: process.env.TEST_VERBOSE ? 'inherit' : 'ignore',
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

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
