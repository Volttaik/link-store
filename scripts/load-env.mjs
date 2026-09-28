/**
 * Minimal .env loader for the CLI scripts.
 *
 * Next.js loads `.env.local` for the application; these scripts run outside
 * Next, so they read the same files themselves. Dependency-free on purpose.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parse(file) {
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;

    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Never override a real process environment variable.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(projectRoot, file);
    if (existsSync(full)) parse(full);
  }
}

/** Resolve the libSQL connection target exactly like the application does. */
export function resolveDatabase() {
  const url =
    process.env.TURSO_DATABASE_URL?.trim() ||
    `file:${path.join(projectRoot, "data", "linkstore.db")}`;
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const isRemote = !url.startsWith("file:");

  if (isRemote && !authToken) {
    console.warn(
      "⚠  TURSO_DATABASE_URL is remote but TURSO_AUTH_TOKEN is empty — connecting without a token.",
    );
  }

  return { url, authToken: isRemote ? authToken : undefined, isRemote };
}
