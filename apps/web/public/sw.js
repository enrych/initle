// Initle service worker: makes the site installable and lets the app open while offline.
// Only the page shell and its static files are cached. Game data (/api, /parties) always goes to the network.
const CACHE = "initle-v1";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res.ok && res.type === "basic" && !res.redirected;

async function put(key, res) {
  if (cacheable(res)) await (await caches.open(CACHE)).put(key, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/parties/")) return;

  // Pages: always try the network first so a new version shows up at once; offline, open the saved shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => put(SHELL, res))
        .catch(async () => (await caches.match(SHELL)) ?? Response.error()),
    );
    return;
  }
  // Built files have a hash in their name and never change: serve from the cache when we have them.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => put(req, res))));
    return;
  }
  // Icons, manifest and the like: network first, saved copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(async () => (await caches.match(req)) ?? Response.error()),
  );
});
