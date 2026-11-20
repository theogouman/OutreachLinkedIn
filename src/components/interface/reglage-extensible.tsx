"use client";

/*
 * Encadré extensible (page maître des Réglages). Fermé : une carte cliquable (icône, titre, résumé).
 * Ouvert : la même carte s'agrandit jusqu'à la hauteur du contenu.
 *
 * Deux transitions Transitions.dev (valeurs d'origine, globals.css) :
 * - « Card resize » (.t-resize) : la hauteur de la carte passe de celle du résumé à celle du
 *   contenu, et inversement à la fermeture ;
 * - « Page side-by-side » (.t-page-slide) : le résumé sort vers la gauche en fondu et flou pendant
 *   que le contenu arrive de la droite ; l'inverse à la fermeture.
 *
 * Les deux « pages » restent dans le DOM (hauteurs mesurées d'avance) ; celle qui n'est pas affichée
 * est `inert` (ni focus, ni clic, ni lecteur d'écran). La page affichée reste dans le flux, l'autre
 * est posée par-dessus (absolue) le temps de sortir. Mouvement réduit : bascule sans animation.
 */

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  const pageResume = useRef<HTMLDivElement>(null);
  const pageContenu = useRef<HTMLDivElement>(null);
  const boutonOuvrir = useRef<HTMLButtonElement>(null);
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const [hauteurs, setHauteurs] = useState<{ resume: number; contenu: number } | null>(null);
  // Focus déplacé seulement après une action de l'utilisateur (pas au premier affichage).
  const interaction = useRef(false);
  const titreId = useId();
  const contenuId = useId();

  // Hauteur de chaque page, suivie (largeur de l'écran, file qui se vide, formulaire qui s'allonge).
  useLayoutEffect(() => {
    const r = pageResume.current;
    const c = pageContenu.current;
    if (!r || !c) return;
    const mesurer = () => setHauteurs({ resume: r.offsetHeight, contenu: c.offsetHeight });
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(r);
    obs.observe(c);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!interaction.current) return;
    interaction.current = false;
    if (ouvert) {
      boutonFermer.current?.focus({ preventScroll: true });
      return;
    }
    boutonOuvrir.current?.focus({ preventScroll: true });
    // Carte refermée au-dessus du haut de l'écran (contenu long) : on la ramène en vue.
    const haut = carte.current?.getBoundingClientRect().top ?? 0;
    if (haut < 0) {
      const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      carte.current?.scrollIntoView({ block: "start", behavior: reduit ? "auto" : "smooth" });
    }
  }, [ouvert]);

  const ouvrir = () => {
    interaction.current = true;
    onOuvrir();
  };
  const fermer = () => {
    interaction.current = true;
    onFermer();
  };

  // Page affichée dans le flux ; l'autre en absolu, par-dessus, le temps de sa sortie.
  const enFlux = { position: "relative" } as const;

  return (
    <section
      ref={carte}
      id={`reglage-${id}`}
      aria-labelledby={titreId}
      className="carte t-resize scroll-mt-4 overflow-hidden md:scroll-mt-28"
      style={{ height: hauteurs ? (ouvert ? hauteurs.contenu : hauteurs.resume) : undefined }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ouvert) {
          e.stopPropagation();
          fermer();
        }
      }}
    >
      <div className="t-page-slide">
        <div ref={pageResume} className="t-page" data-position={ouvert ? "avant" : "actif"} inert={ouvert} style={ouvert ? undefined : enFlux}>
          <button
            ref={boutonOuvrir}
            type="button"
            aria-expanded={ouvert}
            aria-controls={contenuId}
            onClick={ouvrir}
            className="group flex w-full items-center gap-3 px-5 py-4 text-left outline-none transition-colors duration-150 hover:bg-encre/[0.025] focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] sm:px-6 sm:py-5"
          >
            <Pastille>{icone}</Pastille>
            <span className="flex min-w-0 flex-1 flex-col">
              <span id={titreId} className="title-3 text-encre">
                {titre}
              </span>
              <span className={`truncate caption-5 ${alerte ? "text-amber-800 dark:text-amber-300" : "text-encre-3"}`}>{resume}</span>
            </span>
            <svg viewBox="0 0 256 256" className="size-4 shrink-0 text-encre-3 transition-transform duration-200 group-hover:translate-x-0.5" fill="currentColor" aria-hidden>
              <path d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z" />
            </svg>
          </button>
        </div>

        <div
          ref={pageContenu}
          id={contenuId}
          className="t-page"
          data-position={ouvert ? "actif" : "apres"}
          inert={!ouvert}
          style={ouvert ? enFlux : undefined}
        >
          <div className="flex items-start gap-3 px-5 pt-4 sm:px-6 sm:pt-5">
            <button
              ref={boutonFermer}
              type="button"
              onClick={fermer}
              aria-label={`Fermer : ${titre}`}
              title="Fermer"
              className="-ml-1.5 grid size-9 shrink-0 place-items-center rounded-full text-encre-2 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 256 256" className="size-[18px]" fill="currentColor" aria-hidden>
                <path d="M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z" />
              </svg>
            </button>
            <Pastille>{icone}</Pastille>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="title-2 text-encre">{titre}</h2>
              {description && <p className="mt-0.5 body-6 text-encre-3">{description}</p>}
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function Pastille({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-creux text-encre-2 ring-1 ring-trait" aria-hidden>
      {children}
    </span>
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
