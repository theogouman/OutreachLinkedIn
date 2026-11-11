// Service worker de l'outil (adapté de Notion-Club/Infrastructure, public/sw.js).
//
// Ne met en cache QUE les fichiers statiques sans donnée (bundles Next versionnés, icônes,
// écrans de lancement, polices). Les pages HTML, les Server Actions, l'API et Supabase
// passent toujours par le réseau : aucune donnée de prospect n'est gardée sur l'appareil,
// même après déconnexion. Notifications Push : affichées telles quelles, le clic ouvre un chemin
// interne de l'outil (jamais une autre origine).
const VERSION = "v2";
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

self.addEventListener("push", (event) => {
  let n = { titre: "Prospection", corps: "", lien: "/" };
  try {
    n = { ...n, ...(event.data ? event.data.json() : {}) };
  } catch {
    // charge illisible : notification générique
  }
  event.waitUntil(
    self.registration.showNotification(String(n.titre).slice(0, 200), {
      body: String(n.corps || "").slice(0, 1000),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { lien: n.lien },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const brut = event.notification.data && event.notification.data.lien;
  // Chemin interne uniquement (« /x », jamais « //hôte » ni une adresse complète).
  const lien = typeof brut === "string" && /^\/(?!\/)/.test(brut) ? brut : "/";
  const cible = new URL(lien, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existante = fenetres.find((f) => new URL(f.url).origin === self.location.origin);
      if (existante) {
        await existante.focus();
        return existante.navigate(cible);
      }
      return self.clients.openWindow(cible);
    })(),
  );
});
