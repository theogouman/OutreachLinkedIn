"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/*
 * Pages gardées dans le cache client (next.config.ts, staleTimes) : en revenant sur une page déjà
 * vue, elle s'affiche aussitôt depuis le cache, puis ses données sont relues en arrière-plan
 * (router.refresh dans une transition : l'écran actuel reste affiché, et n'est remplacé qu'une fois
 * les nouvelles données prêtes). Même chose au retour sur l'app après plus de 30 s en arrière-plan.
 */
const pagesVues = new Set<string>();
const RETOUR_MS = 30_000;

export function RafraichissementArrierePlan() {
  const chemin = usePathname();
  const router = useRouter();
  const [, demarrer] = useTransition();

  useEffect(() => {
    if (pagesVues.has(chemin)) demarrer(() => router.refresh());
    pagesVues.add(chemin);
  }, [chemin, router]);

  useEffect(() => {
    let cacheeLe = 0;
    const visibilite = () => {
      if (document.visibilityState === "hidden") cacheeLe = Date.now();
      else if (cacheeLe && Date.now() - cacheeLe > RETOUR_MS) demarrer(() => router.refresh());
    };
    document.addEventListener("visibilitychange", visibilite);
    return () => document.removeEventListener("visibilitychange", visibilite);
  }, [router]);

  return null;
}
