"use client";

/*
 * Encadré extensible (page maître des Réglages). Un seul en-tête, toujours présent : un bouton sur
 * toute sa surface, qui ouvre ou referme l'encadré (Échap referme aussi). Fermé : icône, titre et
 * résumé d'une ligne. Ouvert : un chevron « retour » se glisse à gauche, le résumé laisse place à la
 * description, et le contenu apparaît dessous.
 *
 * Transitions Transitions.dev (valeurs d'origine, globals.css) :
 * - « Card resize » (.t-resize) : la hauteur de la carte suit son contenu (mesurée en continu) ;
 *   le chevron s'ouvre en largeur avec la même durée et la même courbe (.reglage-retour), si bien
 *   que l'icône et le titre glissent au lieu de sauter ;
 * - « Page side-by-side » (.t-page-slide) : le résumé sort vers la gauche et la description arrive
 *   de la droite, en fondu et flou ; le contenu arrive de la droite de la même façon.
 *
 * L'élément affiché reste dans le flux, l'autre est posé par-dessus (absolu) le temps de sortir.
 * Le contenu fermé est `inert` (ni focus, ni clic, ni lecteur d'écran). Mouvement réduit : bascule
 * sans animation.
 */

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const EN_FLUX = { position: "relative" } as const;

export function ReglageExtensible({
  id,
  icone,
  titre,
  description,
  resume,
  alerte = false,
  ouvert,
  onOuvrir,
  onFermer,
  children,
}: {
  id: string;
  icone: ReactNode;
  titre: string;
  description?: string;
  /** Une ligne sur l'encadré fermé. */
  resume: string;
  /** Résumé en couleur d'alerte (ex. un envoi incertain à trancher). */
  alerte?: boolean;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
  children: ReactNode;
}) {
  const carte = useRef<HTMLElement>(null);
  const interieur = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState<number | null>(null);
  // Fermeture demandée par l'utilisateur : la carte est ramenée en vue si elle a défilé hors de l'écran.
  const fermeture = useRef(false);
  const titreId = useId();
  const corpsId = useId();

  // Hauteur réelle du contenu, suivie (ouverture, largeur de l'écran, file qui se vide…).
  useLayoutEffect(() => {
    const el = interieur.current;
    if (!el) return;
    const mesurer = () => setHauteur(el.offsetHeight);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (ouvert || !fermeture.current) return;
    fermeture.current = false;
    const haut = carte.current?.getBoundingClientRect().top ?? 0;
    if (haut < 0) {
      const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      carte.current?.scrollIntoView({ block: "start", behavior: reduit ? "auto" : "smooth" });
    }
  }, [ouvert]);

  const fermer = () => {
    fermeture.current = true;
    onFermer();
  };

  return (
    <section
      ref={carte}
      id={`reglage-${id}`}
      aria-labelledby={titreId}
      className="carte t-resize scroll-mt-4 overflow-hidden md:scroll-mt-28"
      style={{ height: hauteur ?? undefined }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ouvert) {
          e.stopPropagation();
          fermer();
        }
      }}
    >
      <div ref={interieur}>
        <button
          type="button"
          aria-expanded={ouvert}
          aria-controls={corpsId}
          onClick={ouvert ? fermer : onOuvrir}
          data-ouvert={ouvert}
          className="reglage-entete group flex w-full items-start px-5 py-4 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] sm:px-6 sm:py-5"
        >
          <span className="reglage-retour text-encre-2" aria-hidden>
            <svg viewBox="0 0 256 256" className="size-[18px] shrink-0" fill="currentColor">
              <path d="M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z" />
            </svg>
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-creux text-encre-2 ring-1 ring-trait" aria-hidden>
            {icone}
          </span>
          <span className="ml-3 flex min-h-9 min-w-0 flex-1 flex-col justify-center">
            <span id={titreId} className="title-3 text-encre">
              {titre}
            </span>
            {/* Résumé (fermé) ↔ description (ouvert), en « Page side-by-side ». */}
            <span className="t-page-slide block">
              <span
                className={`t-page block truncate caption-5 ${alerte ? "text-amber-800 dark:text-amber-300" : "text-encre-3"}`}
                data-position={ouvert && description ? "avant" : "actif"}
                style={ouvert && description ? undefined : EN_FLUX}
              >
                {resume}
              </span>
              {description && (
                <span className="t-page block body-6 text-encre-3" data-position={ouvert ? "actif" : "apres"} style={ouvert ? EN_FLUX : undefined}>
                  {description}
                </span>
              )}
            </span>
          </span>
          <span className="reglage-ouvrir grid h-9 shrink-0 place-items-center text-encre-3" aria-hidden>
            <svg viewBox="0 0 256 256" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="currentColor">
              <path d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z" />
            </svg>
          </span>
        </button>

        <div className="t-page-slide">
          <div
            id={corpsId}
            role="region"
            aria-labelledby={titreId}
            className="t-page"
            data-position={ouvert ? "actif" : "apres"}
            inert={!ouvert}
            style={ouvert ? EN_FLUX : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Corps d'un réglage ouvert (marges communes). */
export function CorpsReglage({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">{children}</div>;
}

/** Pied d'un réglage ouvert : boutons d'enregistrement, à droite. */
export function PiedReglage({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-3 border-t border-trait bg-creux px-5 py-3 sm:px-6">{children}</div>;
}
