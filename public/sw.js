// Service worker: makes the app open fast and handles bill reminders.
// Privacy: pages and data are NEVER cached (they hold your finances). Only the app's own static files are, plus a plain offline page.
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("static-") && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/logos/") || /^\/(icon|apple-icon)[^/]*\.(png|svg)$/.test(url.pathname));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return; // data is never cached
  if (req.mode === "navigate") {
    // Pages: always the network (fresh and private). Offline: a plain "you're offline" page with no data in it.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }
  if (isStaticAsset(url)) {
    // Static files never change for a given URL: serve from cache, fill it on first use.
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain text push */ }
  const title = data.title || "Finance";
  event.waitUntil(self.registration.showNotification(title, { body: data.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag || "finance", data: { url: data.url || "/" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
    for (const c of all) { if ("focus" in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
