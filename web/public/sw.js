/* Enigma PWA service worker
 *
 * Responsibilities:
 * 1) Static asset caching / offline shell
 * 2) Web Push notifications
 * 3) Notification click deep-linking into chat routes
 */

// Один run на парсинг sw.js при установке/обновлении — новый бакет, старые кэши чистит activate.
const APP_VERSION = Date.now();
const CACHE_NAME = "enigma-" + APP_VERSION;
const MAX_ITEMS = 120;

const SHELL = ["/", "/offline.html"];
const NOTIFICATION_ICON = "/icon-192.png";
const NOTIFICATION_BADGE = "/icon-192.png";

const SW_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

function log(...args) {
  if (SW_DEV) console.log("[sw]", ...args);
}

function normalizeUrl(path) {
  try {
    return new URL(path, self.location.origin).toString();
  } catch (_) {
    return self.location.origin;
  }
}

async function limitCache(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  while (keys.length > MAX_ITEMS) {
    await cache.delete(keys.shift());
  }
}

function parsePushData(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") return data;
  } catch (_) {
    // fall through
  }

  try {
    const text = event.data ? event.data.text() : "";
    if (text) {
      return {
        title: "Новое сообщение",
        body: text,
      };
    }
  } catch (_) {
    // ignore
  }

  return {
    title: "Новое сообщение",
    body: "Откройте Enigma, чтобы посмотреть детали.",
  };
}

function buildNotificationOptions(payload) {
  const data = payload && typeof payload === "object" ? payload : {};

  const chatId =
    typeof data.chatId === "string" && data.chatId.trim()
      ? data.chatId.trim()
      : null;

  const url =
    typeof data.url === "string" && data.url.trim()
      ? data.url.trim()
      : chatId
        ? `/chat/${chatId}`
        : "/chat";

  const senderName =
    typeof data.senderName === "string" && data.senderName.trim()
      ? data.senderName.trim()
      : null;

  const body =
    typeof data.body === "string" && data.body.trim()
      ? data.body.trim()
      : "Откройте Enigma, чтобы посмотреть сообщение.";

  return {
    body,
    icon:
      typeof data.icon === "string" && data.icon.trim()
        ? data.icon.trim()
        : NOTIFICATION_ICON,
    badge:
      typeof data.badge === "string" && data.badge.trim()
        ? data.badge.trim()
        : NOTIFICATION_BADGE,
    tag:
      typeof data.tag === "string" && data.tag.trim()
        ? data.tag.trim()
        : chatId
          ? `chat:${chatId}`
          : "chat:generic",
    renotify: true,
    requireInteraction: false,
    data: {
      chatId,
      senderName,
      url,
    },
  };
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (!event || !event.data || typeof event.data !== "object") return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
            return undefined;
          }),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate" || request.destination === "document") {
    return;
  }

  const url = request.url;
  log("fetch", url);

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

  /* Auth/session/cookies только по сети — SW не должен отдавать кэшированные ответы к API или Supabase. */
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
    /* Онлайн: network-first, чтобы после деплоя не залипать на старых `/_next/static/*` (stale chunk). */
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            await cache.put(request, res.clone());
            await limitCache(CACHE_NAME);
          }
          return res;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          return fetch(request);
        }
      }),
    );
    return;
  }

  event.respondWith(fetch(request));
});

self.addEventListener("push", (event) => {
  const payload = parsePushData(event);
  const title =
    payload && typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Новое сообщение";

  const options = buildNotificationOptions(payload);

  log("push", { title, data: options.data });

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.url === "string" &&
    event.notification.data.url.trim()
      ? event.notification.data.url.trim()
      : "/chat";

  const targetUrl = normalizeUrl(targetPath);

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const normalizedClient = `${clientUrl.origin}${clientUrl.pathname}`;
          const normalizedTarget = new URL(targetUrl);
          const targetComparable = `${normalizedTarget.origin}${normalizedTarget.pathname}`;

          if (normalizedClient === targetComparable) {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(targetUrl);
            }
            return;
          }
        } catch (_) {
          // ignore malformed urls
        }
      }

      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  log("notificationclose", event.notification && event.notification.tag);
});
