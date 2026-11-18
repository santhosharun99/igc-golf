/* IGC service worker: makes the app installable and keeps it opening when signal is weak.
 * Pages and scripts: network first (so updates arrive), cached copy when offline.
 * Supabase data/API calls are never cached. Video frames: cache first. */
const VERSION = "igc-v28";
const SHELL = ["./login.html", "./play.html", "./app.html", "./index.html", "./scoring.js", "./ckimport.js", "./regimport.js", "./pwa.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/islworld.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co")) return;                 // live data: always network
  if (url.pathname.includes("/frames/")) {                           // intro video frames
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION + "-frames").then(c => c.put(req, cp)); return r; })));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const lib = url.hostname === "esm.sh" || url.hostname.endsWith("jsdelivr.net") || url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com");
  if (!sameOrigin && !lib) return;
  e.respondWith(
    fetch(sameOrigin ? new Request(req, { cache: "no-cache" }) : req).then(r => {
      if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(hit => hit || (req.mode === "navigate" ? caches.match("./login.html") : undefined)))
  );
});
