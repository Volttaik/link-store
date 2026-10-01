/**
 * Apply the authentication schema.
 *
 * Better Auth's own CLI needs Node 22 and cannot load a TypeScript config that
 * imports `server-only`; this runtime has neither problem, and it runs the
 * engine's *official* migration (the same one the CLI calls) against the engine's
 * *actual* config — so the tables it creates can never drift from the tables the
 * app expects.
 *
 * Development only. In production the schema is part of `db/schema.sql` and is
 * applied by `npm run db:migrate` like every other table.
 */

import { NextResponse } from "next/server";
import { getMigrations } from "better-auth/db/migration";

import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function migrate() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_LOCAL_AUTH_MIGRATION !== "true" || process.env.TURSO_DATABASE_URL?.trim() && !process.env.TURSO_DATABASE_URL.startsWith("file:")) {
    return NextResponse.json(
      { error: "Not available." },
      { status: 403 },
    );
  }

  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    return NextResponse.json({ status: "up to date" });
  }

  await runMigrations();

  return NextResponse.json({
    status: "migrated",
    created: toBeCreated.map((table) => table.table),
    updated: toBeAdded.map((entry) => entry.table),
  });
}

export async function GET() {
  return migrate();
}

export async function POST() {
  return migrate();
}
