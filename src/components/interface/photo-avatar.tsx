"use client";

import Image from "next/image";

/**
 * Photo de profil posée sur les initiales : apparaît en fondu (220 ms) une fois chargée, ou tout de
 * suite si elle est déjà dans le cache de l'appareil (aucun clignotement en changeant de page).
 * Les adresses sont versionnées (?v=) et servies avec un cache privé d'une semaine.
 */
export function PhotoAvatar({ src, taille }: { src: string; taille: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={taille}
      height={taille}
      unoptimized
      decoding="async"
      ref={(img) => {
        // Déjà en cache : affichée sans fondu.
        if (img?.complete && img.naturalWidth > 0) {
          img.style.transition = "none";
          img.style.opacity = "1";
        }
      }}
      onLoad={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      className="absolute inset-0 rounded-full object-cover opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
      style={{ width: taille, height: taille }}
    />
  );
}
