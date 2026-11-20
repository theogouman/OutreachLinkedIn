"use client";
/*
 * Texte qui change sur place (ex. nom et informations de la fiche quand on passe à la fiche
 * voisine) : effet « Blur Out Up » d'animate-text (pixel-point), mêmes paramètres que le
 * placeholder animé des champs (blur-out-up.ts). L'ancien texte part vers le haut en se floutant,
 * mot par mot, le nouveau arrive depuis le bas, en fondu croisé.
 *
 * Le texte courant est rendu par React (lisible, sélectionnable, lu par les lecteurs d'écran) ;
 * l'ancien est une copie posée par-dessus, masquée aux lecteurs d'écran, le temps de sortir.
 * Pas d'animation au premier affichage, ni si `actif` est faux, ni en mouvement réduit.
 */

import { useLayoutEffect, useRef } from "react";
import { APRES_SORTIE, AVANT_ENTREE, CHEVAUCHEMENT_MS, decouper, ENTREE, IMMOBILE, SORTIE, totalSortie } from "./blur-out-up";

export function TexteAnime({ texte, actif = true, className = "" }: { texte: string; actif?: boolean; className?: string }) {
  const courant = useRef<HTMLSpanElement>(null);
  const sortant = useRef<HTMLSpanElement>(null);
  const precedent = useRef(texte);
  const anims = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const prec = precedent.current;
    precedent.current = texte;
    const c = courant.current;
    const s = sortant.current;
    if (!c || !s || prec === texte) return;
    for (const a of anims.current) a.cancel();
    anims.current = [];
    s.replaceChildren();
    if (!actif || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // L'ancien texte part…
    const partants = decouper(s, prec);
    const fins = partants.map((m, i) => {
      const a = m.animate([IMMOBILE, APRES_SORTIE], { duration: SORTIE.duree, delay: i * SORTIE.decalage, easing: SORTIE.courbe, fill: "forwards" });
      anims.current.push(a);
      return a.finished;
    });
    // …le nouveau arrive, mot par mot.
    const retard = Math.max(0, totalSortie(partants.length) - CHEVAUCHEMENT_MS);
    c.querySelectorAll<HTMLElement>("[data-mot]").forEach((m, i) => {
      const a = m.animate([AVANT_ENTREE, IMMOBILE], { duration: ENTREE.duree, delay: retard + i * ENTREE.decalage, easing: ENTREE.courbe, fill: "backwards" });
      anims.current.push(a);
      fins.push(a.finished);
    });
    Promise.all(fins)
      .then(() => s.replaceChildren())
      .catch(() => {}); // annulée par un nouveau changement
  }, [texte, actif]);

  useLayoutEffect(() => () => anims.current.forEach((a) => a.cancel()), []);

  return (
    <span className={`relative block ${className}`}>
      <span ref={courant}>
        {(texte.match(/(\S+|\s+)/g) ?? []).map((m, i) =>
          /\S/.test(m) ? (
            <span key={`${i}:${m}`} data-mot className="inline-block whitespace-pre [backface-visibility:hidden]">
              {m}
            </span>
          ) : (
            m
          ),
        )}
      </span>
      <span ref={sortant} aria-hidden className="pointer-events-none absolute inset-0 select-none" />
    </span>
  );
}
