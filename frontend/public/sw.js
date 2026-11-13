// Service worker: caches the static app shell for fast start-up and installability, and the field round (/field)
// so it opens without internet. It does NOT cache /api responses: the field round keeps its own data and its outbox
// of work requests in IndexedDB (src/lib/offline.ts) and sends them itself, each once, when the connection is back.
const CACHE = "cmms-shell-v4"; // bump to make every phone drop the old shell (same name in src/lib/offline.ts)
const SHELL = ["/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/offline.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    // File names carry a content hash, so a cached copy is never stale.
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  if (SHELL.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    // Manifest and icons: always the current version when online (name / icon changes), cached copy offline.
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === "navigate") {
    if (url.pathname === "/field") {
      // Field round: the latest page when online (kept for later), the kept page without internet.
      e.respondWith(fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/field", copy)); }
        return res;
      }).catch(() => caches.match("/field").then((hit) => hit || caches.match("/offline.html"))));
      return;
    }
    // Any other page without internet: go to the field round if this phone has it, else the offline notice.
    e.respondWith(fetch(e.request).catch(() => caches.match("/field").then((hit) => (hit ? Response.redirect("/field", 302) : caches.match("/offline.html")))));
  }
});
