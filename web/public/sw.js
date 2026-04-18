/* Enigma PWA — SWR для статики; HTML-навигация не перехватывается (избегаем Failed to fetch на /). */
const CACHE_NAME = "enigma-v8";
const MAX_ITEMS = 120;

const SHELL = ["/", "/offline.html"];

const SW_DEV =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

function logFetch(url) {
  if (SW_DEV) console.log("SW FETCH:", url);
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

  // Документ не трогаем — иначе при сбое fetch страница «висит», в консоли sw.js: uncaught.
  if (request.mode === "navigate" || request.destination === "document") {
    return;
  }

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

  event.respondWith(fetch(request));
});
