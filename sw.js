/* Service Worker — Olimpiada Bieździadów 2026 */
const CACHE_NAME = "olimpiada-2026-v28";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/data.js",
  "./js/render.js",
  "./js/notifications.js",
  "./js/celebration.js",
  "./js/sw-register.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/**
 * Shell: cache-first.
 * Google Sheets / external data: network-only (app handles localStorage fallback).
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't cache third-party spreadsheet APIs
  if (
    url.hostname.includes("google.com") ||
    url.hostname.includes("googleusercontent.com") ||
    url.hostname.includes("opensheet.elk.sh")
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response("", { status: 503, statusText: "Offline" }))
    );
    return;
  }

  // Same-origin: stale-while-revalidate style
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
