// Service worker de l'outil (adapté de Notion-Club/Infrastructure, public/sw.js).
//
// Ne met en cache QUE les fichiers statiques sans donnée (bundles Next versionnés, icônes,
// écrans de lancement, polices). Les pages HTML, les Server Actions, l'API et Supabase
// passent toujours par le réseau : aucune donnée de prospect n'est gardée sur l'appareil,
// même après déconnexion. Pas de notifications push (aucun backend pour l'instant).
const VERSION = "v1";
const CACHE_STATIQUE = `statique-${VERSION}`;
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIQUE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cles = await caches.keys();
      await Promise.all(cles.filter((c) => c !== CACHE_STATIQUE).map((c) => caches.delete(c)));
      await self.clients.claim();
    })(),
  );
});

function estStatique(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/")) return true;
  return /\.(woff2?|otf|ttf|svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname);
}

async function cacheDabord(request) {
  const cache = await caches.open(CACHE_STATIQUE);
  const enCache = await cache.match(request);
  if (enCache) return enCache;
  const reponse = await fetch(request);
  if (reponse.ok && reponse.type === "basic") cache.put(request, reponse.clone());
  return reponse;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (estStatique(url)) event.respondWith(cacheDabord(request));
});
