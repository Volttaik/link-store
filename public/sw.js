/* Notification-only worker: never caches account or commerce responses. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function destination(value) {
  return typeof value === "string" && /^\/(messages\/[a-zA-Z0-9_%.-]+|orders|workspace\/orders(\/[a-zA-Z0-9_%.-]+)?)$/.test(value) ? value : "/messages";
}
async function belongsToCurrentAccount(userId) {
  try {
    const response = await fetch("/api/notifications", { cache: "no-store", credentials: "include" });
    return response.ok && (await response.json()).userId === userId;
  } catch { return false; }
}
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (!data?.userId || !await belongsToCurrentAccount(data.userId)) return;
    await self.registration.showNotification(data.title || "Rush Cart", {
      body: data.body || "You have an account update.", icon: "/brand/rush-cart-logo.png",
      tag: data.tag || "rush-cart:update", data: { userId: data.userId, url: destination(data.url) },
    });
  })());
});
// Reading a thread spends its notification: the app asks the worker to close
// whatever it posted for that conversation, so no stale notice outlives it.
self.addEventListener("message", event => {
  if (!event.data?.closeTag) return;
  event.waitUntil((async () => {
    for (const notification of await self.registration.getNotifications()) {
      if (notification.tag === event.data.closeTag) notification.close();
    }
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    if (!await belongsToCurrentAccount(event.notification.data?.userId)) return;
    const url = new URL(destination(event.notification.data?.url), self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});
