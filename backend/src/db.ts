// db.ts — shared infra clients for the backend.
//
// Both Prisma and pg.Pool are instantiated at first import. Importers
// must ensure DATABASE_URL is set in process.env BEFORE the first
// import in any execution path (production: dotenv loads it on
// server.ts startup; tests: setupTestDb sets env then dynamic-imports).

import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { convertDecimalsDeep } from "./utils/decimal";

// Every monetary column is Prisma.Decimal (see schema.prisma) — for NUMERIC/
// DECIMAL columns Prisma returns Decimal instances from every operation
// (findMany, groupBy, $queryRaw, ...), not just raw queries. Most of the
// codebase was written when those columns were Float and expects plain JS
// numbers back: `+=` on a Decimal silently concatenates strings instead of
// adding, and strict-equality test assertions (`.toBe(450)`) fail against a
// Decimal instance even when the value is numerically identical. Converting
// centrally here — for every operation, not just raw queries — keeps that
// assumption true everywhere this shared client is used, on top of (not
// instead of) the explicit conversions already done at the repository
// boundary (see repositories/**), which remain the right place for *new*
// code to do it explicitly, for symmetry with the repo-layer-only
// convention. tests/helpers/db.ts applies the same extension to the
// Testcontainers client used in integration/repository tests.
export const prisma = new PrismaClient().$extends({
  query: {
    $allOperations({ args, query }) {
      return query(args).then((result) => convertDecimalsDeep(result));
    },
  },
}) as unknown as PrismaClient;

export const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
