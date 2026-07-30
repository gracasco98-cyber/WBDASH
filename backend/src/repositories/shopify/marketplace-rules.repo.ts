// marketplace-rules.repo.ts — Repository layer for MarketplaceRule entity.
//
// NOTE: As of the discovery phase for PR 12, there are ZERO callsites accessing
// prisma.marketplaceRule.* directly in the codebase. Marketplace rule logic is
// handled entirely by the in-memory config at backend/src/config/marketplace-rules.ts.
//
// This file is a placeholder that satisfies the PR spec and provides a typed
// interface should DB-backed rules be introduced in future PRs.
//
// Each function takes `prisma: PrismaClient` as the first parameter (dependency injection).
import type { PrismaClient } from "@prisma/client";

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Return all active marketplace rules ordered by priority ascending.
 * Currently unused in production — rules are loaded from the config file.
 * Reserved for future DB-backed rule management.
 */
export async function findAllMarketplaceRules(
  prisma: PrismaClient
): Promise<unknown[]> {
  // MarketplaceRule model may not exist in the current Prisma schema.
  // If it does, replace the body with:
  //   return (prisma as any).marketplaceRule.findMany({ orderBy: { priority: 'asc' } });
  // For now, return empty — no callers exist.
  void prisma; // satisfy eslint no-unused-vars
  return [];
}
