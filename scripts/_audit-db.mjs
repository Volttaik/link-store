import { createClient } from "@libsql/client";
import { loadEnv, resolveDatabase } from "./load-env.mjs";

loadEnv();
const { url, authToken } = resolveDatabase();
const client = createClient(authToken ? { url, authToken } : { url });

const cols = await client.execute("PRAGMA table_info(shipments)");
console.log("shipments columns:", cols.rows.map((r) => r.name).join(", "));

const t = await client.execute("SELECT status, COUNT(*) c FROM tickets GROUP BY status");
console.log("ticket states:", JSON.stringify(t.rows));

const o = await client.execute(
  "SELECT COUNT(*) c FROM orders WHERE receipt_code IS NULL",
);
console.log("orders missing receipt_code:", JSON.stringify(o.rows));

const s = await client.execute("SELECT COUNT(*) c FROM shipments");
console.log("shipments rows:", JSON.stringify(s.rows));

client.close();
