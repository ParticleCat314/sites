/*
 * Service worker: the app shell is precached on install so the page works with
 * no network at all. Piano samples live on another origin and are far larger
 * than the shell, so they are cached opportunistically as they are fetched —
 * the sampler pulls its whole velocity layer the first time you press Play,
 * which means one playback while online is enough to make playback work
 * offline afterwards.
 */

const VERSION = "v5";
const SHELL_CACHE = `scale-compendium-shell-${VERSION}`;
const SAMPLE_CACHE = "scale-compendium-samples";

const SAMPLE_ORIGIN = "https://smpldsnds.github.io";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./fonts.css",
  "./dist/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/Besley-600-latin.woff2",
  "./fonts/Besley-600-latin-ext.woff2",
  "./fonts/SourceSans3-400-latin.woff2",
  "./fonts/SourceSans3-400-latin-ext.woff2",
  "./fonts/SplineSansMono-500-latin.woff2",
  "./fonts/SplineSansMono-500-latin-ext.woff2",
  "./fonts/vexflow/bravura/bravura.woff2",
  "./fonts/vexflow/academico/academico.woff2",
];

/*
 * The one file the app cannot start without. Everything else is precached
 * best-effort: `cache.addAll` is all-or-nothing, so a single renamed or
 * missing asset would abort the install and leave the app with no offline
 * support at all — the loudest possible failure for the least important file.
 */
const DOCUMENT = "./index.html";

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.add(DOCUMENT);
  await Promise.all(
    SHELL.filter((url) => url !== DOCUMENT).map((url) => cache.add(url).catch(() => {}))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("scale-compendium-shell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Navigations go to the network first. A cached document that turns out to be
 * stale is the worst failure this app has: it can reference asset URLs that no
 * longer exist, and the page then renders as unstyled HTML with no way for the
 * user to force a refresh. Falling back to the cache keeps it working offline.
 */
async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    /*
     * Stored under the bare document URL, not the requested one. `start_url`
     * carries a per-build cache-busting query, so keying on the request would
     * store a fresh copy of the whole document on every launch.
     */
    if (response.ok) (await caches.open(SHELL_CACHE)).put(DOCUMENT, response.clone());
    return response;
  } catch {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ??
      (await caches.match(DOCUMENT)) ??
      (await caches.match("./"));
    if (cached) return cached;
    return new Response("Offline and no cached document.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

/** Cache-first, with a background refresh so updates land on the next visit. */
async function shellResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    void fetch(request)
      .then(async (response) => {
        if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
    return response;
  } catch (err) {
    // a navigation that missed the cache still gets the app shell
    if (request.mode === "navigate") {
      const fallback = await caches.match(DOCUMENT);
      if (fallback) return fallback;
    }
    throw err;
  }
}

/** Cache-first and never revalidated: the sample files are immutable. */
async function sampleResponse(request) {
  const cache = await caches.open(SAMPLE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // 404s are expected here (the sampler probes formats), so only keep hits
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // offline with this sample missing: a 504 lets the sampler fail cleanly
    // instead of surfacing an unhandled rejection from respondWith
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === SAMPLE_ORIGIN) {
    event.respondWith(sampleResponse(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(
      request.mode === "navigate" ? navigationResponse(request) : shellResponse(request)
    );
  }
});

/** Lets the page report how much of the piano is already stored offline. */
self.addEventListener("message", (event) => {
  if (event.data !== "sample-count") return;
  event.waitUntil(
    caches
      .open(SAMPLE_CACHE)
      .then((cache) => cache.keys())
      .then((keys) => event.source?.postMessage({ type: "sample-count", count: keys.length }))
  );
});
