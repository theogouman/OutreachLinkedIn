"use client";

/*
 * Règle commune des panneaux ancrés (menus, notifications, confirmations) : un panneau ouvert
 * reste entièrement dans la partie visible de l'écran, à `marge` px des bords.
 * - Horizontalement : décalé du nécessaire si son ancrage (right-0 / left-0) le ferait déborder
 *   (ex. la cloche n'est pas au bord droit sur téléphone).
 * - Verticalement : hauteur bornée à l'espace restant jusqu'au bas de l'écran (clavier compris).
 * Le décalage passe par la propriété CSS `translate` (utilitaire `dans-ecran`), indépendante de
 * `transform` : les animations d'apparition (CSS ou motion) ne sont pas touchées.
 * Mesure faite sur la mise en page (offsetLeft / offsetWidth), pas sur le rendu animé.
 */

import { useLayoutEffect, useRef } from "react";

export function useDansEcran<T extends HTMLElement>(ouvert: boolean, marge = 16) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!ouvert || !el) return;
    const ajuster = () => {
      const parent = el.offsetParent?.getBoundingClientRect();
      if (!parent) return;
      const largeurEcran = document.documentElement.clientWidth;
      const hauteurEcran = window.visualViewport?.height ?? window.innerHeight;
      const gauche = parent.left + el.offsetLeft;
      const droite = gauche + el.offsetWidth;
      let dx = 0;
      if (droite > largeurEcran - marge) dx = largeurEcran - marge - droite;
      if (gauche + dx < marge) dx = marge - gauche;
      el.style.setProperty("--dans-ecran-x", `${Math.round(dx)}px`);
      const haut = parent.top + el.offsetTop;
      el.style.setProperty("--dans-ecran-h", `${Math.max(160, Math.floor(hauteurEcran - haut - marge))}px`);
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    window.visualViewport?.addEventListener("resize", ajuster);
    return () => {
      window.removeEventListener("resize", ajuster);
      window.visualViewport?.removeEventListener("resize", ajuster);
    };
  }, [ouvert, marge]);

  return ref;
}
