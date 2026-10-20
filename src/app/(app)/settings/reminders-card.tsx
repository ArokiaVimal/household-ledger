"use client";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";

type State =
  | { kind: "loading" }
  | { kind: "off-server" }
  | { kind: "unsupported"; why: string }
  | { kind: "blocked" }
  | { kind: "ready"; on: boolean; key: string };

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Card-bill reminders on this device. Needs the installed app on iPhone; the server needs its push keys set. */
export function RemindersCard() {
  const [s, setS] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const set = (v: State) => { if (alive) setS(v); };
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return set({ kind: "unsupported", why: isIos() && !standalone() ? "Add the app to your Home Screen first, then open it from there." : "This browser can't show reminders." });
      if (isIos() && !standalone()) return set({ kind: "unsupported", why: "Add the app to your Home Screen first, then open it from there." });
      const r = await fetch("/api/push/subscribe").then((x) => x.json() as Promise<{ enabled?: boolean; publicKey?: string | null }>).catch(() => null);
      if (!r?.enabled || !r.publicKey) return set({ kind: "off-server" });
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return set({ kind: "unsupported", why: "Reminders work in the installed app. Open the live app and try again." });
      if (Notification.permission === "denied") return set({ kind: "blocked" });
      set({ kind: "ready", on: !!(await reg.pushManager.getSubscription()), key: r.publicKey });
    })();
    return () => { alive = false; };
  }, []);

  const turnOn = async (key: string) => {
    setBusy(true); setMsg(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") { setS({ kind: "blocked" }); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) { await sub.unsubscribe(); setMsg(((await res.json()) as { error?: string }).error ?? "Could not turn reminders on."); return; }
      setS({ kind: "ready", on: true, key });
    } catch { setMsg("Could not turn reminders on."); } finally { setBusy(false); }
  };
  const turnOff = async (key: string) => {
    setBusy(true); setMsg(null);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setS({ kind: "ready", on: false, key });
    } catch { setMsg("Could not turn reminders off."); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    setMsg(res?.ok ? "Sent. It should arrive in a moment." : ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not send a test.");
    setBusy(false);
  };

  return (
    <Card className="space-y-3">
      <CardTitle tip="One alert a day when a card bill is due within 3 days or late. Only on devices where you turn this on.">Bill reminders</CardTitle>
      {s.kind === "loading" && <p className="text-sm text-muted">Checking…</p>}
      {s.kind === "off-server" && <p className="text-sm text-muted">Reminders aren&apos;t set up on this server yet. The app owner adds push keys once.</p>}
      {s.kind === "unsupported" && <p className="text-sm text-muted">{s.why}</p>}
      {s.kind === "blocked" && <p className="text-sm text-muted">Notifications are blocked for this app. Allow them in your phone&apos;s settings, then come back.</p>}
      {s.kind === "ready" && (
        <div className="space-y-3">
          <button type="button" role="switch" aria-checked={s.on} disabled={busy} onClick={() => void (s.on ? turnOff(s.key) : turnOn(s.key))} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-background px-3.5 text-left text-sm disabled:opacity-60">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><Bell size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">Remind me about card bills</span><span className="block text-xs text-muted">{s.on ? "On for this device" : "Off for this device"}</span></span>
            <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${s.on ? "bg-accent" : "bg-border"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${s.on ? "left-[1.15rem]" : "left-0.5"}`} /></span>
          </button>
          {s.on && <Button disabled={busy} onClick={() => void test()}>Send a test</Button>}
        </div>
      )}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </Card>
  );
}
