/* Northstar's app shell. User plans stay in the application's local storage. */
const SHELL_URL = new URL(self.registration.scope);
const SHELL_PATH = SHELL_URL.pathname;
// CacheStorage is shared by every app on this origin; keep each base isolated.
const CACHE_PREFIX = `northstar-shell-${encodeURIComponent(SHELL_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const PUBLIC_FILES = [
  SHELL_PATH,
  ...['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']
    .map((file) => new URL(file, SHELL_URL).pathname),
];
const NEVER_CACHE_PATH = /^(?:api|auth|oauth|data|\.well-known)(?:\/|$)/;
const ASSET_PATH = /^assets\/.+\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/i;

function relativePath(url) {
  return url.pathname.startsWith(SHELL_PATH) ? url.pathname.slice(SHELL_PATH.length) : null;
}

function isPublicAsset(url) {
  const path = relativePath(url);
  return url.origin === SHELL_URL.origin && path !== null && !url.search && !url.hash &&
    (PUBLIC_FILES.includes(url.pathname) || ASSET_PATH.test(path));
}

function canCache(response) {
  return response.ok && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('Cache-Control') || '');
}

async function saveResponse(key, response) {
  if (!canCache(response)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, response);
  } catch {
    // Cache quota or storage restrictions must not prevent a network response.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const reload = (path) => new Request(path, { cache: 'reload', credentials: 'same-origin' });
    await cache.addAll(PUBLIC_FILES.map(reload));

    // Vite's versioned JS and CSS are discovered from the built index. This
    // makes the first successful production visit usable offline, even if the
    // browser loaded those assets before this worker took control.
    const shell = await cache.match(SHELL_PATH);
    const markup = await shell.text();
    const assets = new Set();
    for (const match of markup.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], SHELL_URL);
      if (isPublicAsset(url) && ASSET_PATH.test(relativePath(url))) {
        assets.add(url.pathname);
      }
    }
    await cache.addAll([...assets].map(reload));
    // Self-hosted fonts may load before the worker controls the page. Cache
    // their CSS URLs too so the first visit prepares the full offline layout.
    const fonts = new Set();
    for (const asset of assets) {
      if (!asset.endsWith('.css')) continue;
      const css = await (await cache.match(asset)).text();
      for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const url = new URL(match[1], new URL(asset, self.location.origin));
        if (isPublicAsset(url) && ASSET_PATH.test(relativePath(url))) fonts.add(url.pathname);
      }
    }
    await cache.addAll([...fonts].map(reload));
    // Let an existing version finish its open sessions before activating.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const path = relativePath(url);
  if (request.method !== 'GET' || !/^https?:$/.test(url.protocol) ||
      url.origin !== SHELL_URL.origin || path === null || url.search ||
      request.headers.has('Authorization') || NEVER_CACHE_PATH.test(path)) return;

  if (request.mode === 'navigate') {
    if (path !== '' && path !== 'index.html') return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.headers.get('Content-Type')?.includes('text/html')) {
          await saveResponse(SHELL_PATH, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(SHELL_PATH) || new Response(
          'Northstar is offline. Open it once with an internet connection to prepare offline access.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  if (!isPublicAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Versioned public assets have the same bytes for this origin. A server's
    // Vary: Origin must not make a crossorigin script miss its precached copy.
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(request);
    await saveResponse(request, response.clone());
    return response;
  })());
});
