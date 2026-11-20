"use client";

/*
 * Recherche de la barre des vues (liste Prospects).
 * - Ordinateur et tablette (≥ 640 px) : champ en pilule de 40 px, à la hauteur des onglets.
 * - Téléphone : bouton rond en verre dépoli (fond translucide flouté) ; au toucher, il s'étire vers
 *   la gauche jusqu'à couvrir toute la barre (durée et courbe de « Card resize ») et devient le champ
 *   de saisie, focalisé dans le geste (clavier iOS). La croix efface la saisie, puis replie la barre ; Échap
 *   aussi ; quitté vide, il se replie seul.
 * Le parent doit être positionné (relative) : la barre dépliée le recouvre.
 */

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IconeFermer, IconeRecherche } from "@/components/icones";
import { TexteSaisieAnime } from "@/components/interface/texte-saisie-anime";

const VERRE =
  "bg-carte/85 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-inset ring-trait shadow-[0_4px_16px_rgba(0,0,0,0.06)]";

function Indicateur({ enCours, valeur, effacer }: { enCours: boolean; valeur: string; effacer: () => void }) {
  if (enCours) return <span className="size-3.5 animate-spin rounded-full border-2 border-trait border-t-accent" role="status" aria-label="Chargement des résultats" />;
  if (!valeur) return null;
  return (
    <button
      type="button"
      onClick={effacer}
      aria-label="Effacer la recherche"
      className="grid size-6 place-items-center rounded-full text-encre-3 outline-none hover:bg-encre/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
    >
      <IconeFermer taille={12} />
    </button>
  );
}

export function RechercheRepliable({
  valeur,
  changer,
  enCours,
  /** Décalage du bouton replié depuis le bord droit (place des boutons à sa droite), en px. */
  decalageDroite = 0,
}: {
  valeur: string;
  changer: (v: string) => void;
  enCours: boolean;
  decalageDroite?: number;
}) {
  const [ouverte, setOuverte] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const clavier = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (valeur) changer("");
    else setOuverte(false);
  };
  const ouvrir = () => {
    flushSync(() => setOuverte(true));
    champ.current?.focus({ preventScroll: true });
  };

  return (
    <>
      {/* Ordinateur : champ en ligne. */}
      <label className="relative hidden w-64 max-w-[40vw] shrink-0 sm:block">
        <span className="sr-only">Rechercher un prospect</span>
        <IconeRecherche taille={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-encre-3" />
        <input
          type="search"
          value={valeur}
          onChange={(e) => changer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && valeur) {
              e.preventDefault();
              changer("");
            }
          }}
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-full bg-carte pl-10 pr-9 body-6 text-encre shadow-[0_0_0_1px_var(--color-trait)] outline-none transition-shadow duration-150 focus-visible:shadow-[0_0_0_1px_var(--color-accent),0_0_0_3px_rgba(224,98,90,0.12)] [&::-webkit-search-cancel-button]:appearance-none"
        />
        <TexteSaisieAnime valeur={valeur} placeholder="Rechercher" />
        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
          <Indicateur enCours={enCours} valeur={valeur} effacer={() => changer("")} />
        </span>
      </label>

      {/* Téléphone : place réservée au bouton replié, puis la barre en verre qui s'étire. */}
      <span className="size-10 shrink-0 sm:hidden" aria-hidden />
      <div
        role="search"
        aria-label="Rechercher un prospect"
        style={ouverte ? { right: 0, width: "100%" } : { right: decalageDroite, width: 40 }}
        className={`absolute inset-y-0 z-20 flex items-center overflow-hidden rounded-full transition-[width,right] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:hidden ${VERRE}`}
      >
        {ouverte ? (
          <label className="relative flex h-full min-w-0 flex-1 items-center">
            <span className="sr-only">Rechercher un prospect</span>
            <IconeRecherche taille={16} className="pointer-events-none absolute left-3.5 text-encre-3" />
            <input
              ref={champ}
              type="search"
              value={valeur}
              onChange={(e) => changer(e.target.value)}
              onKeyDown={clavier}
              onBlur={() => !valeur && setOuverte(false)}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              className="h-full w-full bg-transparent pl-10 pr-16 text-base text-encre outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            <TexteSaisieAnime valeur={valeur} placeholder="Rechercher" />
            {enCours && (
              <span className="absolute right-11 size-3.5 animate-spin rounded-full border-2 border-trait border-t-accent" role="status" aria-label="Chargement des résultats" />
            )}
            {/* Une seule croix : efface la saisie, puis replie la barre. */}
            <button
              type="button"
              onClick={() => (valeur ? changer("") : setOuverte(false))}
              aria-label={valeur ? "Effacer la recherche" : "Replier la recherche"}
              className="absolute right-1 grid size-8 place-items-center rounded-full text-encre-2 outline-none hover:bg-encre/[0.05] focus-visible:ring-2 focus-visible:ring-accent"
            >
              <IconeFermer taille={14} />
            </button>
          </label>
        ) : (
          <button
            type="button"
            onClick={ouvrir}
            aria-label={valeur ? `Rechercher (en cours : ${valeur})` : "Rechercher"}
            className="relative grid size-10 shrink-0 place-items-center rounded-full text-encre-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <IconeRecherche taille={17} />
            {valeur && <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" aria-hidden />}
          </button>
        )}
      </div>
    </>
  );
}
