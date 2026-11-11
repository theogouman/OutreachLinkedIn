"use client";

import { useEffect } from "react";

/** Enregistre /sw.js en production (cache des fichiers statiques uniquement). */
export function EnregistrementServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const enregistrer = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((r) => r.update())
        .catch(() => {
          // Sans service worker, l'app fonctionne normalement (simplement sans cache local).
        });
    };
    if (document.readyState === "complete") enregistrer();
    else window.addEventListener("load", enregistrer, { once: true });
  }, []);
  return null;
}
