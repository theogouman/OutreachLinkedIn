"use client";

/*
 * Texte long replié, déplié par « Voir plus » avec la transition Transitions.dev « Card resize »
 * (classe .t-resize, globals.css : la hauteur du cadre passe de la hauteur repliée à la hauteur
 * réelle du texte, 300 ms, ease-out). Le texte entier est toujours dans le DOM (lecteurs d'écran,
 * sélection, recherche de la page) ; replié, seul le cadre est plus bas, avec un fondu en bas.
 * Repli seulement au-delà de `seuil` caractères ET si le texte dépasse vraiment `lignes` lignes.
 * Mouvement réduit : bascule sans animation (règle .t-resize de globals.css).
 */

import { useId, useLayoutEffect, useRef, useState } from "react";

export function TexteDepliable({
  texte,
  seuil = 280,
  lignes = 5,
  className = "",
}: {
  texte: string;
  /** Nombre de caractères au-delà duquel le texte est replié. */
  seuil?: number;
  /** Lignes visibles une fois replié. */
  lignes?: number;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mesures, setMesures] = useState<{ pleine: number; repliee: number } | null>(null);
  const contenu = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const long = texte.length > seuil;

  // Hauteurs réelles (texte entier, et `lignes` lignes), suivies si la largeur change.
  useLayoutEffect(() => {
    const p = contenu.current;
    if (!p || !long) return;
    const mesurer = () => {
      const hauteurLigne = parseFloat(getComputedStyle(p).lineHeight) || 20;
      setMesures({ pleine: p.scrollHeight, repliee: Math.round(hauteurLigne * lignes) });
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(p);
    return () => obs.disconnect();
  }, [long, lignes, texte]);

  const replie = long && !!mesures && mesures.pleine > mesures.repliee + 4;
  const hauteur = !replie ? undefined : ouvert ? mesures!.pleine : mesures!.repliee;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        id={id}
        className={`t-resize w-full overflow-hidden ${replie && !ouvert ? "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]" : ""}`}
        // Avant la première mesure : déjà replié en CSS (pas de saut à l'affichage).
        style={{ height: hauteur, maxHeight: long && !mesures ? `${lignes * 1.5}em` : undefined }}
      >
        <p ref={contenu} className={`selectionnable whitespace-pre-wrap break-words ${className}`}>
          {texte}
        </p>
      </div>
      {replie && (
        <button
          type="button"
          aria-expanded={ouvert}
          aria-controls={id}
          onClick={() => setOuvert((o) => !o)}
          className="rounded-md caption-3 text-rouge outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
        >
          {ouvert ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}
