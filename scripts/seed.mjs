/**
 * Apply db/seed.sql — platform-wide catalogue categories only.
 *
 * No stores, products, orders or metrics are created: the application must show
 * honest empty states rather than fabricated marketplace activity.
 *
 * Usage:  npm run db:seed
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

loadEnv();

const { url, authToken, isRemote } = resolveDatabase();
const client = createClient(authToken ? { url, authToken } : { url });

const seed = readFileSync(path.join(projectRoot, "db", "seed.sql"), "utf8");

console.log(`→ Seeding reference data into ${isRemote ? "Turso (remote)" : url}`);

try {
  await client.executeMultiple(seed);

  const result = await client.execute(
    "SELECT COUNT(*) AS total FROM categories WHERE store_id IS NULL",
  );

  console.log(
    `✓ Platform categories present: ${result.rows[0]?.total ?? 0} (idempotent — existing rows untouched)`,
  );
} catch (error) {
  console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.close();
}
