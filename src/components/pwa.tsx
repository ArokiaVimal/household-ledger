"use client";
import { History, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearImportMarker, interruptedImport, type ImportMarker } from "@/lib/import-marker";
import { STUCK_NAVIGATION_MS, internalTarget, resumeAction } from "@/lib/self-heal";

const subscribe = (cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; };

/** Keeps the app from zooming, registers the service worker (production only) and shows a slim banner while the device is offline. */
export function Pwa() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  // Safari ignores "no zoom" in the viewport, so stop its pinch gesture directly. Taps and scrolling are untouched.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const events = ["gesturestart", "gesturechange", "gestureend"] as const;
    for (const ev of events) document.addEventListener(ev, stop);
    return () => { for (const ev of events) document.removeEventListener(ev, stop); };
  }, []);
  // The app can freeze on a phone: a tap that never lands, or a page that slept for hours. Recover instead of waiting for a restart.
  useEffect(() => {
    const here = () => window.location.pathname + window.location.search;
    // 1. A tap on a link that has not reached its page after a few seconds: load that page the plain way.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const to = internalTarget(a.getAttribute("href"), window.location.origin, here(), { target: a.getAttribute("target"), download: a.hasAttribute("download"), modifier: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 });
      if (!to) return;
      // Only when the screen has not moved at all: a page that moved (even to a slightly different address after a redirect) is fine.
      const before = here();
      window.setTimeout(() => { if (here() === before && navigator.onLine) window.location.assign(to); }, STUCK_NAVIGATION_MS);
    };
    // 2. Back from the background: refresh when the screen is old or a newer version is live, but never while a form is open.
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      const formOpen = !!document.querySelector("dialog[open]");
      let action = resumeAction(away, { formOpen });
      if (action === "check_version") {
        try {
          const res = await fetch("/api/version", { cache: "no-store", signal: AbortSignal.timeout(4000) });
          const live = ((await res.json()) as { version?: string }).version;
          const mine = process.env.NEXT_PUBLIC_BUILD_ID;
          action = resumeAction(away, { formOpen: !!document.querySelector("dialog[open]"), versionDiffers: !!live && !!mine && mine !== "dev" && live !== mine });
        } catch { action = "none"; }
      }
      if (action === "reload") window.location.reload();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // An import the phone cut short leaves a note; say so once, instead of leaving you guessing what happened.
  const [lost, setLost] = useState<ImportMarker | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setLost(interruptedImport())); }, []);
  const banner = lost && (
    <div role="status" className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-xl items-start gap-3 rounded-2xl bg-foreground p-3 text-sm text-white shadow-lg">
      <History size={18} aria-hidden className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1">Your last import{lost.name ? ` (${lost.name})` : ""} did not finish{lost.phase === "save" ? ", and it may or may not have been saved" : ", so nothing was saved"}. <Link href="/import" onClick={() => { clearImportMarker(); setLost(null); }} className="font-medium underline">Check Earlier imports</Link> before trying again.</p>
      <button type="button" aria-label="Dismiss" onClick={() => { clearImportMarker(); setLost(null); }} className="grid size-8 shrink-0 place-items-center rounded-full text-white/80 hover:text-white"><X size={16} aria-hidden /></button>
    </div>
  );
  if (online) return banner || null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warn-soft px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-xs font-medium text-warn">
      <WifiOff size={14} aria-hidden />You&apos;re offline. Changes can&apos;t be saved.
    </div>
  );
}
