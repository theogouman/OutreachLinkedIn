"use client";

/*
 * Ordre des fiches visibles dans la liste en cours (Prospects filtrés, ou Inbox), publié par la
 * liste et lu par la fiche pour ses flèches précédente / suivante. Simple magasin en mémoire.
 */

import { useEffect, useSyncExternalStore } from "react";

let ordre: readonly string[] = [];
const abonnes = new Set<() => void>();
const VIDE: readonly string[] = [];

function publier(ids: readonly string[]) {
  if (ids.length === ordre.length && ids.every((id, i) => id === ordre[i])) return;
  ordre = ids;
  for (const f of abonnes) f();
}

/** À appeler par une liste : publie l'ordre de ses fiches tant qu'elle est affichée. */
export function usePublierOrdreFiches(ids: readonly string[]) {
  const cle = ids.join(",");
  useEffect(() => {
    publier(cle ? cle.split(",") : VIDE);
  }, [cle]);
}

export function useOrdreFiches(): readonly string[] {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => ordre,
    () => VIDE,
  );
}
