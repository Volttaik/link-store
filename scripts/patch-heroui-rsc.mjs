/**
 * Restore the `"use client"` directive that HeroUI v3's published build drops.
 *
 * HeroUI's source marks these modules as client-only, but the ESM that ships in
 * `@heroui/react@3.2.6` omits the directive on four shared leaf modules. Without
 * it, Next.js pulls them into the React Server Components graph (they are
 * imported directly by non-client entry points such as `avatar/index.js`), and
 * module evaluation dies on `createContext is not a function` — which takes down
 * every page whose server tree renders an Avatar or a calendar.
 *
 * This runs as `postinstall`, is idempotent, and does nothing once upstream
 * ships the directive itself.
 *
 * Usage:  node scripts/patch-heroui-rsc.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { projectRoot } from "./load-env.mjs";

/** Leaf modules that upstream marks `"use client"` but the published dist does not. */
const FILES = [
  "components/avatar-group/avatar-group-context.js",
  "components/calendar-year-picker/year-picker-context.js",
  "utils/collection-prop-injection.js",
  "utils/use-has-text-slot.js",
];

const DIRECTIVE = '"use client";';

const distRoot = path.join(projectRoot, "node_modules", "@heroui", "react", "dist");

if (!existsSync(distRoot)) {
  // Nothing installed yet — a missing package must not break `npm install`.
  process.exit(0);
}

const patched = [];

for (const relative of FILES) {
  const file = path.join(distRoot, relative);

  if (!existsSync(file)) continue;

  const source = readFileSync(file, "utf8");

  if (source.startsWith(DIRECTIVE)) continue;

  writeFileSync(file, `${DIRECTIVE}\n${source}`);
  patched.push(relative);
}

if (patched.length > 0) {
  console.log(`→ Restored ${DIRECTIVE} in ${patched.length} @heroui/react module(s):`);
  for (const file of patched) console.log(`  · ${file}`);
}
