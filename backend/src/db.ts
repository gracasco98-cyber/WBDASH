// db.ts — shared infra clients for the backend.
//
// Both Prisma and pg.Pool are instantiated at first import. Importers
// must ensure DATABASE_URL is set in process.env BEFORE the first
// import in any execution path (production: dotenv loads it on
// server.ts startup; tests: setupTestDb sets env then dynamic-imports).

import { PrismaClient } from "@prisma/client";
import pg from "pg";

export const prisma = new PrismaClient();

export const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
