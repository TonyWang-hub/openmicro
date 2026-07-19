/**
 * Service Worker for the OpenMicro PWA app-shell (offline-first for /toy/ static assets only).
 *
 * IMPORTANT SCOPE LIMITATION (read before touching this file):
 * This script is served from /toy/sw.js. Per the Service Worker spec, the
 * *maximum* scope a worker can claim is the directory it's served from,
 * unless the server sends a `Service-Worker-Allowed` response header to
 * widen it. Host (host/index.js) is off-limits to edit here, and it does
 * not send that header, so this worker's real scope is /toy/ — it can
 * NEVER control the /m document itself (m.html lives outside /toy/).
 *
 * Consequence: fetch-event interception only happens for *clients already
 * controlled* by this worker, and control is granted per-document based on
 * the document's own URL being inside scope. Since /m is out of scope, the
 * /m page will never become "controlled", so none of its sub-resource
 * requests (keyboard.css, toy/*.js, manifest.json, icon.svg) are actually
 * intercepted by the fetch handler below, even though those URLs are under
 * /toy/. This worker mainly pre-warms the Cache Storage for /toy/ assets
 * and would become fully effective the moment Host ever serves this file
 * (or an equivalent) with `Service-Worker-Allowed: /`, or from a root path —
 * neither of which this task is allowed to change (host/ is off-limits).
 *
 * What this DOES deliver today:
 * - Any request actually reaching this worker's fetch handler for a /toy/
 *   GET (e.g. a future page under /toy/, or a browser that widens control)
 *   gets network-first-with-cache-fallback, so a flaky/offline connection
 *   still resolves the app shell.
 * - Never caches the WS upgrade (fetch events don't fire for WebSocket
 *   handshakes at all — nothing to special-case) and never caches /m or
 *   anything outside /toy/, since /m's HTML is auth-cookie-gated per
 *   request and must never be served stale/cross-session from a shared
 *   cache.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `cms-toy-shell-${CACHE_VERSION}`;

/** App-shell assets under /toy/ — no auth token embedded, safe to cache. */
const PRECACHE_URLS = [
  '/toy/manifest.json',
  '/toy/icon.svg',
  '/toy/keyboard.css',
  '/toy/keyboard.js',
  '/toy/audio.js',
  '/toy/haptics.js',
  '/toy/demo-script.js',
  '/toy/live.js',
  '/toy/sw.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => { /* offline install or asset 404 — activate anyway with whatever cached */ }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('cms-toy-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * Only ever handle same-origin GET requests under /toy/. Everything else
 * (WS upgrades never reach here anyway; /m HTML; /api/*; /ingest/*) is left
 * untouched so the browser's normal networking (and Host's auth) applies.
 * @param {Request} request
 */
function shouldHandle(request) {
  if (request.method !== 'GET') return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/toy/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandle(event.request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(event.request);
        // Only cache clean same-origin 200s (avoid opaque/error responses).
        if (fresh && fresh.ok && fresh.type === 'basic') {
          cache.put(event.request, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
