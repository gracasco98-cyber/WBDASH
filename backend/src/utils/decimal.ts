// utils/decimal.ts — safe conversion at the boundary between Prisma.Decimal
// (used for monetary columns) and the plain JS `number` the rest of the
// codebase (services, routes, frontend) expects.
//
// Why this exists: `Prisma.Decimal` does not overload arithmetic operators.
// `decimalA + decimalB` silently coerces both to strings and concatenates
// them instead of adding — no TypeScript error when the surrounding code is
// typed `any` (e.g. `$queryRaw<any[]>`). Always convert with `toNum()`
// immediately after reading a Decimal-typed field, before any arithmetic or
// before it leaves the backend in a JSON response.
import { Prisma } from "@prisma/client";

export function toNum(value: Prisma.Decimal | number | string | null | undefined): number;
export function toNum(value: null): null;
export function toNum(value: undefined): undefined;
export function toNum(
  value: Prisma.Decimal | number | string | null | undefined
): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Number(value);
}

/**
 * Recursively converts every `Prisma.Decimal` found in a value (plain object,
 * array, or nested combination) to a plain JS `number`. Used to sanitize
 * `$queryRaw`/`$queryRawUnsafe` results, which Prisma returns with the same
 * `Decimal` type as normal model queries for NUMERIC/DECIMAL columns.
 *
 * Only walks plain objects and arrays — Date, null, and primitives pass
 * through untouched (by reference for objects like Date).
 */
export function convertDecimalsDeep<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => convertDecimalsDeep(v)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = convertDecimalsDeep(v);
    }
    return result as unknown as T;
  }
  return value;
}
