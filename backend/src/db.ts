// db.ts — shared infra clients for the backend.
//
// Both Prisma and pg.Pool are instantiated at first import. Importers
// must ensure DATABASE_URL is set in process.env BEFORE the first
// import in any execution path (production: dotenv loads it on
// server.ts startup; tests: setupTestDb sets env then dynamic-imports).

import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { convertDecimalsDeep } from "./utils/decimal";

// Raw queries ($queryRaw/$queryRawUnsafe) return Prisma.Decimal for NUMERIC/
// DECIMAL columns, same as regular model queries — but most raw-SQL call
// sites across the codebase were written when every monetary column was
// Float and expect plain JS numbers back. Converting centrally here (instead
// of at each of the ~50 raw-query call sites) keeps that assumption true
// without touching business logic. Model queries (findMany, groupBy, ...)
// are NOT covered by this — those are converted explicitly at the
// repository boundary (see repositories/**), which is where new code should
// keep doing it, for symmetry with the repo-layer-only convention.
export const prisma = new PrismaClient().$extends({
  query: {
    $allOperations({ operation, args, query }) {
      if (operation === "queryRaw" || operation === "queryRawUnsafe") {
        return query(args).then((result) => convertDecimalsDeep(result));
      }
      return query(args);
    },
  },
}) as unknown as PrismaClient;

export const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
