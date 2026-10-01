"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "rush-cart:privacy:v1";
type Preferences = { version: 1; optional: boolean; savedAt: string };
function readPreferences(): Preferences | null {
  const valid = (raw: string | null) => {
    try { const value = JSON.parse(raw ?? "null") as Preferences | null; return value?.version === 1 && typeof value.optional === "boolean" && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt)) ? value : null; } catch { return null; }
  };
  const saved: Preferences[] = [];
  try { const stored = valid(localStorage.getItem(KEY)); if (stored) saved.push(stored); } catch { /* Try the essential preference cookie below. */ }
  const cookie = document.cookie.split(/;\s*/).find(entry => entry.startsWith("rush_cart_privacy="));
  try { const stored = cookie ? valid(decodeURIComponent(cookie.slice("rush_cart_privacy=".length))) : null; if (stored) saved.push(stored); } catch { /* Ignore an invalid cookie. */ }
  return saved.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] ?? null;
}

export function PrivacyPreferences() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [optional, setOptional] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => { const stored = readPreferences(); if (stored) { setOptional(stored.optional); setOpen(false); } else setOpen(true); };
    sync(); setReady(true);
    const storageSync = (event: StorageEvent) => { if (event.key === KEY || event.key === null) sync(); };
    window.addEventListener("storage", storageSync);
    window.addEventListener("rush-cart:privacy", sync);
    return () => { window.removeEventListener("storage", storageSync); window.removeEventListener("rush-cart:privacy", sync); };
  }, []);
  const save = (allowed: boolean) => {
    const preferences: Preferences = { version: 1, optional: allowed, savedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Storage may be unavailable; no optional technology is loaded. */ }
    try { document.cookie = `rush_cart_privacy=${encodeURIComponent(JSON.stringify(preferences))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Both storage mechanisms may be blocked by the browser. */ }
    // Do not pretend a choice persisted when the browser blocked both stores.
    const stored = readPreferences();
    if (!stored || stored.savedAt !== preferences.savedAt || stored.optional !== allowed) {
      setError("Your browser could not save this choice. Allow site storage and try again. Optional cookies remain disabled.");
      setOptional(false); return;
    }
    setError(""); setOptional(allowed); setOpen(false); setManaging(false);
    window.dispatchEvent(new CustomEvent("rush-cart:privacy", { detail: preferences }));
  };
  if (!ready) return null;
  return <>
    {!open ? <button type="button" className="fixed bottom-20 left-3 z-40 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-muted shadow-sm" onClick={() => { setOpen(true); setManaging(true); }}>Privacy preferences</button> : null}
    {open ? <section aria-label="Cookie and storage preferences" className="fixed bottom-20 left-3 right-3 z-50 max-w-md rounded-2xl border border-border bg-surface p-4 shadow-lg sm:left-5 sm:right-auto">
      <h2 className="text-sm font-semibold">Your privacy choices</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted">Rush Cart uses necessary cookies for sign-in, your cart and security. We also remember your theme and privacy choices. No optional advertising or third-party analytics trackers are currently loaded. <Link href="/cookies" className="underline">Cookie information</Link></p>
      {managing ? <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={optional} onChange={event => setOptional(event.target.checked)} />Allow optional analytics if introduced (currently inactive)</label> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-foreground px-3 py-2 text-xs font-medium text-background" onClick={() => save(managing ? optional : true)}>{managing ? "Save preferences" : "Accept"}</button>
        <button type="button" className="rounded-full border border-border px-3 py-2 text-xs font-medium" onClick={() => save(false)}>Necessary only</button>
        {!managing ? <button type="button" className="px-2 py-2 text-xs text-muted underline" onClick={() => setManaging(true)}>Manage</button> : null}
      </div>
    </section> : null}
  </>;
}
