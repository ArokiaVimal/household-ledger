"use client";
import { WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; };

/** Registers the service worker (production only) and shows a slim banner while the device is offline. */
export function Pwa() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warn-soft px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-xs font-medium text-warn">
      <WifiOff size={14} aria-hidden />You&apos;re offline. Changes can&apos;t be saved.
    </div>
  );
}
