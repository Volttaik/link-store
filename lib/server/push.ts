import "server-only";
import webpush from "web-push";
import { execute, query } from "../db";

export const pushPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
export const isPushConfigured = Boolean(pushPublicKey && privateKey && /^(mailto:|https:\/\/)/.test(subject));

export function validPushSubscription(value: unknown): value is webpush.PushSubscription {
  if (!value || typeof value !== "object") return false;
  const input = value as webpush.PushSubscription;
  try {
    const url = new URL(input.endpoint);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || url.port || input.endpoint.length > 2048) return false;
    if (!(host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" || host.endsWith(".notify.windows.com"))) return false;
    return /^[A-Za-z0-9_-]{87}=?$/.test(input.keys?.p256dh ?? "") && /^[A-Za-z0-9_-]{22}={0,2}$/.test(input.keys?.auth ?? "");
  } catch { return false; }
}

export async function savePushSubscription(userId: string, sessionId: string, subscription: webpush.PushSubscription) {
  if (!validPushSubscription(subscription)) throw new Error("This browser's notification subscription is not supported.");
  // One endpoint belongs to the currently authenticated browser session only.
  await execute(`INSERT INTO push_subscriptions (endpoint, user_id, session_id, p256dh, auth)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
    session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  [subscription.endpoint, userId, sessionId, subscription.keys.p256dh, subscription.keys.auth]);
}

export async function sendAccountPush(userId: string, notification: { title: string; body: string; url: string; tag: string }) {
  if (!isPushConfigured) return { sent: 0, failed: 0 };
  const rows = await query<{ endpoint: string; p256dh: string; auth: string }>(`SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
    JOIN sessions s ON s.id = p.session_id AND s.user_id = p.user_id
    WHERE p.user_id = ? AND julianday(s.expires_at) > julianday('now')`, [userId]);
  const outcomes = await Promise.all(rows.map(async row => {
    const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    if (!validPushSubscription(subscription)) return false;
    try {
      await webpush.sendNotification(subscription, JSON.stringify({ ...notification, userId }), {
        vapidDetails: { subject, publicKey: pushPublicKey, privateKey }, TTL: 300, timeout: 5000,
      });
      return true;
    } catch (error) {
      if ([404, 410].includes((error as { statusCode?: number }).statusCode ?? 0)) await execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", [row.endpoint, userId]);
      return false;
    }
  }));
  return { sent: outcomes.filter(Boolean).length, failed: outcomes.filter(value => !value).length };
}
