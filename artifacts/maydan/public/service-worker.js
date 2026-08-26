const CACHE_VERSION = "maydan-__BUILD_ID__";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith("/")
  ? scopeUrl.pathname
  : `${scopeUrl.pathname}/`;

const blockedPath = /(?:^|\/)(?:api|auth|rest|graphql|functions|storage|supabase)(?:\/|$)/i;
const staticAsset = /\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp3|wav|ogg|webmanifest)$/i;

function canCache(request, url) {
  const hasAuthParameters =
    url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token") ||
    url.searchParams.has("error_description") ||
    (url.searchParams.has("code") && !url.pathname.startsWith(`${scopePath}party`));

  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith(scopePath) &&
    !blockedPath.test(url.pathname) &&
    !request.headers.has("authorization") &&
    !hasAuthParameters
  );
}

async function cacheResponse(cacheName, request, response) {
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(scopeUrl.href, { cache: "reload" })))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("maydan-") && ![STATIC_CACHE, SHELL_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!canCache(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(SHELL_CACHE, request, response))
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(scopeUrl.href)) ||
            Response.error()
          );
        }),
    );
    return;
  }

  if (!staticAsset.test(url.pathname) && !url.pathname.endsWith("/manifest.json")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => cacheResponse(STATIC_CACHE, request, response));
    }),
  );
});