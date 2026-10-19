"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";

const BUILT = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const short = (v: string) => (v === "dev" ? "dev" : v.slice(0, 7));

/**
 * "Sync now" for a phone: fetches the latest data and checks whether a newer version of the app has been published. If there is
 * one, "Update now" clears the app's cached files and reloads, which is what an installed home-screen app needs.
 */
export function SyncCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newer, setNewer] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      router.refresh(); // latest data from the server
      const res = await fetch("/api/version", { cache: "no-store" });
      const { version } = (await res.json()) as { version?: string };
      setAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
      if (version && version !== "dev" && BUILT !== "dev" && version !== BUILT) { setNewer(version); setMsg({ ok: true, text: "Your data is up to date, and a newer version of the app is ready." }); }
      else { setNewer(null); setMsg({ ok: true, text: "Everything is up to date." }); }
    } catch { setMsg({ ok: false, text: "Could not reach the server. Check your connection and try again." }); }
    setBusy(false);
  };
  const update = async () => {
    try { if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k); } catch { /* nothing cached */ }
    try { for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister(); } catch { /* none */ }
    window.location.reload();
  };

  return (
    <Card className="space-y-3">
      <CardTitle tip="Pulls in the latest data and checks whether a newer version of the app has been published. On an installed phone app, tap Update now to load it.">App &amp; sync</CardTitle>
      <p className="text-sm text-muted">Version <span className="num font-medium text-foreground">{short(BUILT)}</span>{at ? ` · last synced ${at}` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void sync()} disabled={busy}><RefreshCw size={15} aria-hidden className={busy ? "animate-spin" : ""} />{busy ? "Syncing…" : "Sync now"}</Button>
        {newer && <Button onClick={() => void update()}>Update now ({short(newer)})</Button>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>{msg.text}</p>}
    </Card>
  );
}
