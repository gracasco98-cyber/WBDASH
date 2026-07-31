// context/account-context.ts — request/job-scoped "current Amazon account".
//
// Every Amazon-domain table now requires amazonAccountId (multi-account
// migration, 2026-07-30). Threading an explicit accountId parameter through
// every function in amazon/**, its repositories, and every route would touch
// dozens of files end to end. Instead, the account is set once per Express
// request (middleware) or per sync-job iteration (one account at a time,
// see amazon/sync.job.ts) via runWithAccount(), and any code deeper in that
// call stack reads it with getCurrentAccountId() — same pattern commonly
// used for request-scoped tenant IDs in Node.
//
// This does NOT replace explicit `prisma: PrismaClient` dependency
// injection in repositories/** — it only supplies the accountId value that
// repository functions add to their where/create/update clauses.
import { AsyncLocalStorage } from "async_hooks";

interface AccountContext {
  amazonAccountId: string;
}

const storage = new AsyncLocalStorage<AccountContext>();

/** Runs `fn` with `amazonAccountId` available to getCurrentAccountId() anywhere in its call stack. */
export function runWithAccount<T>(amazonAccountId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ amazonAccountId }, fn);
}

/** Returns the current scope's amazonAccountId. Throws if called outside runWithAccount(). */
export function getCurrentAccountId(): string {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "No Amazon account in scope — this code path must run inside runWithAccount() " +
        "(Express middleware for routes, or the per-account loop in sync.job.ts)"
    );
  }
  return ctx.amazonAccountId;
}

/** Same as getCurrentAccountId() but returns null instead of throwing when out of scope. */
export function tryGetCurrentAccountId(): string | null {
  return storage.getStore()?.amazonAccountId ?? null;
}
