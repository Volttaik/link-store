"use client";

import { useEffect, useState } from "react";

async function registerPush(userId: string) {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  const config = await response.json();
  if (!response.ok || config.userId !== userId || !config.configured) throw new Error("Browser notifications are not available yet.");
  await navigator.serviceWorker.register("/sw.js");
  const worker = await navigator.serviceWorker.ready;
  let subscription = await worker.pushManager.getSubscription();
  const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
  if (subscription?.options.applicationServerKey && !bytes.every((value, index) => new Uint8Array(subscription!.options.applicationServerKey!)[index] === value)) {
    await subscription.unsubscribe(); subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const saved = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
  const result = await saved.json();
  if (!saved.ok || result.userId !== userId) throw new Error(result.error ?? "Notifications could not be enabled.");
}

export function BrowserNotifications({ userId }: { userId: string | null }) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  useEffect(() => {
    let active = true;
    setNotice(""); setSubscribed(false); setAvailable(false);
    if (!userId || !window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPermission(Notification.permission);
    void fetch("/api/notifications", { cache: "no-store" }).then(response => response.json()).then(async config => {
      if (!active || config.userId !== userId || !config.configured) return;
      setAvailable(true);
      if (Notification.permission === "granted") {
        try { await registerPush(userId); if (active) setSubscribed(true); }
        catch { if (active) setNotice("Notifications need to reconnect. Try again."); }
      }
    }).catch(() => {});
    const clear = () => {
      active = false; setAvailable(false); setSubscribed(false); setNotice("");
      void navigator.serviceWorker.getRegistration("/").then(async worker => {
        if (!worker) return;
        for (const notification of await worker.getNotifications()) notification.close();
        await (await worker.pushManager.getSubscription())?.unsubscribe();
      }).catch(() => {});
    };
    window.addEventListener("rush-cart:signed-out", clear);
    return () => { active = false; window.removeEventListener("rush-cart:signed-out", clear); };
  }, [userId]);
  const enable = async () => {
    if (!userId || busy) return;
    setBusy(true); setNotice("");
    try {
      const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if (result === "granted") { await registerPush(userId); setSubscribed(true); setNotice("Browser notifications enabled."); }
      else if (result === "denied") setNotice("Notifications are blocked. You can change this in browser settings.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Notifications could not be enabled."); }
    finally { setBusy(false); }
  };
  if (!userId || !available) return null;
  return <div className="fixed bottom-32 right-3 z-40 max-w-56 text-right sm:bottom-20">
    {permission !== "denied" && !subscribed ? <button type="button" disabled={busy} onClick={enable} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-muted shadow-sm">{busy ? "Enabling…" : permission === "granted" ? "Reconnect notifications" : "Enable notifications"}</button> : null}
    {notice ? <p role="status" className="mt-2 rounded-xl bg-surface p-2 text-xs text-muted shadow-sm">{notice}</p> : null}
  </div>;
}
