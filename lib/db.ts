/**
 * Database access (Turso / libSQL).
 *
 * `@libsql/client` speaks the same protocol to a local SQLite file and to a
 * remote Turso database, so development and production run identical SQL —
 * only the connection target changes.
 */

import { createClient, type Client, type InValue } from "@libsql/client";

const LOCAL_DATABASE_URL = "file:./data/linkstore.db";

declare global {
  // eslint-disable-next-line no-var
  var __linkStoreDb: Client | undefined;
}

function createDb(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim() || LOCAL_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  // A local file URL must never be given an auth token, and a remote URL
  // should not be used without one in production.
  if (authToken && !url.startsWith("file:")) {
    return createClient({ url, authToken });
  }

  return createClient({ url });
}

export const db: Client =
  globalThis.__linkStoreDb ?? (globalThis.__linkStoreDb = createDb());

/** True when the app is talking to a local file database rather than Turso. */
export const isLocalDatabase = !process.env.TURSO_DATABASE_URL?.trim();

export type SqlArgs = InValue[];

/**
 * One row, as a plain object a Client Component can accept.
 *
 * libSQL builds every row as an array-like object: the columns are enumerable,
 * but the numeric indices and `length` are defined with `Object.defineProperty`
 * and therefore non-enumerable. React's own "is this a plain object?" test
 * (`isSimpleObject` in react-server-dom-webpack) rejects any object with a
 * non-enumerable own property, so a row handed straight to a component fails
 * with "Only plain objects can be passed to Client Components … Classes or other
 * objects with methods are not supported" — which is exactly what happened to
 * the listing editor, and only once a listing had images to pass along.
 *
 * Checking the prototype alone is not enough: a libSQL row's prototype *is*
 * `Object.prototype`, yet its hidden index/length properties still fail React's
 * test. So a row is only kept as-is when every own property is enumerable, and
 * otherwise rebuilt with just the columns. Copying here means every read in the
 * app produces plain data, so no component can be broken by the shape a driver
 * returns. Rows are array-like as well as keyed, but every read in this app
 * addresses columns by name, so the named properties are what get copied — from
 * the row itself when they are own properties, and from the prototype when a
 * driver keeps them there.
 */
function toPlainRow<T>(row: unknown): T {
  if (row === null || typeof row !== "object") return row as T;

  const source = row as Record<string, unknown>;

  // Already safe to hand across the boundary: nothing hidden, no prototype of
  // its own. Returning the same object keeps the common case allocation-free.
  if (isClientSerializable(source)) return source as T;

  const plain: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    // A driver's own internal holder (a nested class instance) is not a column
    // and cannot be serialised, so it is left behind rather than carried into a
    // component.
    if (isColumnValue(source[key])) plain[key] = source[key];
  }

  // Columns exposed as prototype getters rather than own properties.
  const prototype = Object.getPrototypeOf(source) as object | null;
  if (prototype && prototype !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key in plain || key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor && "get" in descriptor && isColumnValue(source[key])) {
        plain[key] = source[key];
      }
    }
  }

  return plain as T;
}

/**
 * Mirrors React's `isSimpleObject`: a record is safe to pass to a Client
 * Component only when its prototype is `Object.prototype` (or null) and every
 * own property is enumerable. Anything else — a class instance, or a libSQL row
 * with hidden index/length properties — is rebuilt by the caller.
 */
function isClientSerializable(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) return false;

  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable) return false;
  }

  return true;
}

/**
 * Whether a value can survive the trip to a Client Component.
 *
 * Column values are primitives, so this only ever rejects a driver's internal
 * machinery — the exact thing that must not be handed to a component.
 */
function isColumnValue(value: unknown): boolean {
  if (value === null || typeof value !== "object") return typeof value !== "function";
  if (Array.isArray(value) || value instanceof Date) return true;

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/** Run a query and return all rows typed as T. */
export async function query<T>(sql: string, args: SqlArgs = []): Promise<T[]> {
  const result = await db.execute({ sql, args });
  return result.rows.map((row) => toPlainRow<T>(row));
}

/** Run a query and return the first row, or null. */
export async function queryOne<T>(
  sql: string,
  args: SqlArgs = [],
): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

/** Run a statement that does not return rows. */
export async function execute(sql: string, args: SqlArgs = []) {
  return db.execute({ sql, args });
}

export type BatchStatement = { sql: string; args?: SqlArgs };

/**
 * Execute several statements atomically. libSQL runs a batch inside a single
 * transaction, which is how multi-row writes (order + items, sale + ledger
 * entries) stay consistent.
 */
export async function batch(statements: BatchStatement[]) {
  if (statements.length === 0) return [];
  return db.batch(
    statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

/** Convert a SQLite integer column into a boolean. */
export function bool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}
