import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { execute, queryOne } from "@/lib/db";
import { isPushConfigured, pushPublicKey, savePushSubscription, validPushSubscription } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function session() { return auth.api.getSession({ headers: await headers() }); }
export async function GET() {
  const current = await session();
  if (!current) return json({ error: "Sign in to manage notifications." }, 401);
  const ready = isPushConfigured && Boolean(await queryOne("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'push_subscriptions'"));
  return json({ userId: current.user.id, configured: ready, publicKey: ready ? pushPublicKey : null });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Request not allowed." }, 403);
  const current = await session();
  if (!current) return json({ error: "Sign in to manage notifications." }, 401);
  if (!isPushConfigured) return json({ error: "Browser notifications are not available yet." }, 503);
  const subscription: unknown = await request.json().catch(() => null);
  if (!validPushSubscription(subscription)) return json({ error: "Invalid browser subscription." }, 400);
  await savePushSubscription(current.user.id, current.session.id, subscription);
  return json({ ok: true, userId: current.user.id });
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Request not allowed." }, 403);
  const current = await session();
  if (!current) return json({ error: "Sign in to manage notifications." }, 401);
  await execute("DELETE FROM push_subscriptions WHERE session_id = ? AND user_id = ?", [current.session.id, current.user.id]);
  return json({ ok: true });
}
