"use client";

/*
 * Avatar avec photo : transition Transitions.dev « Skeleton loader and reveal » (.t-skel, globals.css).
 * Les initiales servent de squelette (une pulsation pendant le chargement), puis la photo arrive
 * en fondu et flou croisés (400 ms). Une photo déjà vue (cette session, ou déjà dans le cache de
 * l'appareil) est posée d'emblée, sans aucune animation : revenir sur une page ne rejoue rien.
 * Chargement immédiat (pas différé) : les adresses sont versionnées (?v=) et gardées une semaine.
 */

import { useState, type CSSProperties } from "react";

/** Photos déjà affichées pendant cette session (mémoire de l'onglet). */
const photosVues = new Set<string>();

export function AvatarPhoto({ src, initiales, taille, style }: { src: string; initiales: string; taille: number; style: CSSProperties }) {
  // « instantane » : photo déjà vue ou déjà en cache, posée sans transition ; « revele » : fondu.
  const [etat, setEtat] = useState<"chargement" | "revele" | "instantane">(() => (photosVues.has(src) ? "instantane" : "chargement"));
  const reveler = (instantane: boolean) => {
    photosVues.add(src);
    setEtat(instantane ? "instantane" : "revele");
  };

  return (
    <span
      aria-hidden
      className={`t-skel inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-encre/5 ${etat === "chargement" ? "" : "is-revealed"} ${etat === "instantane" ? "is-resetting" : ""}`}
      style={{ width: taille, height: taille }}
    >
      <span className={`t-skel-skeleton grid place-items-center rounded-full caption-3 ${etat === "chargement" ? "is-pulsing" : ""}`} style={style}>
        <span>{initiales}</span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- image servie par l'outil, déjà petite et en cache */}
      <img
        src={src}
        alt=""
        width={taille}
        height={taille}
        loading="eager"
        decoding={etat === "instantane" ? "sync" : "async"}
        ref={(img) => {
          // Déjà dans le cache de l'appareil (complète dès l'insertion) : posée sans animation.
          if (etat === "chargement" && img?.complete && img.naturalWidth > 0) reveler(true);
        }}
        onLoad={() => {
          if (etat === "chargement") reveler(false);
        }}
        className="t-skel-content size-full rounded-full object-cover"
      />
    </span>
  );
}
