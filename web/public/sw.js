/* Enigma PWA — SWR для статики; HTML в fetch не кэшируется; API / Supabase — только сеть. */
const CACHE_NAME = "enigma-v5";
const MAX_ITEMS = 120;

const SHELL = ["/", "/offline.html"];

const SW_DEV =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

function logFetch(url) {
  if (SW_DEV) console.log("SW FETCH:", url);
}

function fetchWithTimeout(request, timeout = 3000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject("timeout"), timeout)),
  ]);
}

async function limitCache(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  while (keys.length > MAX_ITEMS) {
    await cache.delete(keys.shift());
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = request.url;
  logFetch(url);

  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch (_) {
    return;
  }

  const isApi =
    url.includes("supabase") ||
    url.includes("/rest/v1") ||
    url.includes("/auth/") ||
    url.includes("/realtime/") ||
    url.includes("/api/") ||
    url.includes("/next/data/") ||
    url.includes("/_next/data/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/");

  if (isApi) {
    event.respondWith(fetch(request));
    return;
  }

  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return;
  } catch (_) {
    return;
  }

  const isStaticDest =
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font";

  const isStaticPath =
    pathname.startsWith("/_next/static/") ||
    /\.(js|mjs|css|woff2?|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname);

  if (isStaticDest || isStaticPath) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);

        const fetchPromise = fetch(request).then(async (res) => {
          if (res && res.ok) {
            await cache.put(request, res.clone());
            await limitCache(CACHE_NAME);
          }
          return res;
        });

        if (cached) {
          event.waitUntil(
            fetchPromise.catch(() => {
              /* фоновое обновление */
            })
          );
          return cached;
        }

        return fetchPromise;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, 3000)
        .then((res) => res)
        .catch(() =>
          caches.match("/offline.html").then(
            (r) =>
              r ||
              new Response("<!DOCTYPE html><html><body><p>Offline</p></body></html>", {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              })
          )
        )
    );
    return;
  }

  event.respondWith(fetch(request));
});
