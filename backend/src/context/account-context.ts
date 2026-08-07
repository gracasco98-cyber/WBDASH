// context/account-context.ts — request/job-scoped "current Amazon account(s)".
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
// The main dashboard aggregates across every active account by default
// (2026-08-07) — runWithAccounts() puts more than one id in scope for that
// case, and read-only repository functions that opt in read the full list
// via getCurrentAccountIds(). getCurrentAccountId() keeps returning a single
// id (the first one) for every write path and any code not yet updated to
// aggregate — none of those should ever run with more than one id in scope.
//
// This does NOT replace explicit `prisma: PrismaClient` dependency
// injection in repositories/** — it only supplies the accountId value(s)
// repository functions add to their where/create/update clauses.
import { AsyncLocalStorage } from "async_hooks";

interface AccountContext {
  amazonAccountIds: string[];
}

const storage = new AsyncLocalStorage<AccountContext>();

/** Runs `fn` with a single `amazonAccountId` in scope. */
export function runWithAccount<T>(amazonAccountId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ amazonAccountIds: [amazonAccountId] }, fn);
}

/** Runs `fn` with multiple `amazonAccountIds` in scope — for read-only aggregation across accounts. */
export function runWithAccounts<T>(amazonAccountIds: string[], fn: () => Promise<T>): Promise<T> {
  return storage.run({ amazonAccountIds }, fn);
}

/** Returns the current scope's first amazonAccountId. Throws if called outside runWithAccount(s)(). */
export function getCurrentAccountId(): string {
  return getCurrentAccountIds()[0];
}

/** Returns every amazonAccountId in the current scope. Throws if called outside runWithAccount(s)(). */
export function getCurrentAccountIds(): string[] {
  const ctx = storage.getStore();
  if (!ctx || ctx.amazonAccountIds.length === 0) {
    throw new Error(
      "No Amazon account in scope — this code path must run inside runWithAccount()/runWithAccounts() " +
        "(Express middleware for routes, or the per-account loop in sync.job.ts)"
    );
  }
  return ctx.amazonAccountIds;
}

/** Same as getCurrentAccountId() but returns null instead of throwing when out of scope. */
export function tryGetCurrentAccountId(): string | null {
  return storage.getStore()?.amazonAccountIds[0] ?? null;
}
