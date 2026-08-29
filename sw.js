const CACHE_NAME = "festec-fidelidad-v3-20260829-1";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=20260829-1",
  "./script.js?v=20260829-1",
  "./manifest.json",
  "./img/logo.png",
  "./img/fondo.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" }).then((networkResponse) => {
      if (networkResponse.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });
      }
      return networkResponse;
    }).catch(() => caches.match(event.request))
  );
});
