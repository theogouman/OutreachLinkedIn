"use client";
/*
 * Sections à onglets, trois transitions Transitions.dev (CSS dans globals.css) :
 * - « Tabs sliding » : la pastille suit l'onglet actif (offsetLeft / offsetWidth écrits en ligne,
 *   placement sans animation au premier rendu et au redimensionnement) ;
 * - « Page side-by-side » (généralisé à N sections) : la section sortante glisse et s'estompe
 *   vers son côté, l'entrante arrive de l'autre ;
 * - « Card resize » : le conteneur prend la hauteur de la section active, en transition.
 * Clavier : flèches gauche / droite, Début, Fin (motif ARIA « tabs »).
 * `remplir` : pour un parent à hauteur fixe (modale). Les sections prennent toute la hauteur
 * restante et défilent à l'intérieur ; pas de « Card resize ».
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type Section = { id: string; libelle: string; compte?: number; contenu: ReactNode };

export function SectionsGlissantes({
  sections,
  libelle,
  remplir = false,
}: {
  sections: Section[];
  libelle: string;
  remplir?: boolean;
}) {
  const [actif, setActif] = useState(0);
  const base = useId();
  const barre = useRef<HTMLDivElement>(null);
  const pilule = useRef<HTMLSpanElement>(null);
  const onglets = useRef<(HTMLButtonElement | null)[]>([]);
  const pages = useRef<(HTMLElement | null)[]>([]);
  const [hauteur, setHauteur] = useState<number | undefined>(undefined);

  // Lit l'onglet actif via une ref : la fonction reste stable, et l'observateur de
  // redimensionnement n'est pas recréé (son premier appel replacerait la pastille sans animation).
  const actifRef = useRef(actif);
  const placerPilule = useCallback((animer: boolean) => {
    const p = pilule.current;
    const o = onglets.current[actifRef.current];
    if (!p || !o) return;
    if (!animer) p.style.transition = "none";
    p.style.width = `${o.offsetWidth}px`;
    p.style.transform = `translateX(${o.offsetLeft}px)`;
    if (!animer) {
      void p.offsetWidth; // applique la position avant de rétablir la transition
      p.style.transition = "";
    }
  }, []);

  const premierPlacement = useRef(true);
  useLayoutEffect(() => {
    actifRef.current = actif;
    placerPilule(!premierPlacement.current);
    premierPlacement.current = false;
  }, [actif, placerPilule]);

  // Hauteur du conteneur = hauteur de la section active (suivie si son contenu change).
  useLayoutEffect(() => {
    const page = pages.current[actif];
    if (!page || remplir) return;
    const mesurer = () => setHauteur(page.offsetHeight);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(page);
    return () => obs.disconnect();
  }, [actif, remplir]);

  useEffect(() => {
    const b = barre.current;
    if (!b) return;
    const obs = new ResizeObserver(() => placerPilule(false));
    obs.observe(b);
    return () => obs.disconnect();
  }, [placerPilule]);

  const aller = (i: number) => {
    const n = (i + sections.length) % sections.length;
    setActif(n);
    onglets.current[n]?.focus();
  };
  const clavier = (e: KeyboardEvent) => {
    const touches: Record<string, number> = { ArrowRight: actif + 1, ArrowLeft: actif - 1, Home: 0, End: sections.length - 1 };
    if (e.key in touches) {
      e.preventDefault();
      aller(touches[e.key]!);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${remplir ? "min-h-0 flex-1" : ""}`}>
      <div ref={barre} className="t-tabs t-tabs-plein" role="tablist" aria-label={libelle} onKeyDown={clavier}>
        <span ref={pilule} className="t-tabs-pill" aria-hidden />
        {sections.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              onglets.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-onglet-${s.id}`}
            aria-selected={i === actif}
            aria-controls={`${base}-section-${s.id}`}
            tabIndex={i === actif ? 0 : -1}
            onClick={() => setActif(i)}
            className="t-tab flex items-center gap-1.5 body-5"
          >
            {s.libelle}
            {s.compte !== undefined && <span className="caption-4 tabular-nums text-encre-3">{s.compte}</span>}
          </button>
        ))}
      </div>

      <div
        className={remplir ? "t-page-slide t-remplir min-h-0 flex-1 overflow-hidden" : "t-page-slide t-resize overflow-hidden"}
        style={remplir ? undefined : { height: hauteur }}
      >
        {sections.map((s, i) => (
          <section
            key={s.id}
            ref={(el) => {
              pages.current[i] = el;
            }}
            className="t-page"
            data-position={i < actif ? "avant" : i > actif ? "apres" : "actif"}
            role="tabpanel"
            id={`${base}-section-${s.id}`}
            aria-labelledby={`${base}-onglet-${s.id}`}
            aria-hidden={i !== actif}
            inert={i !== actif}
          >
            {s.contenu}
          </section>
        ))}
      </div>
    </div>
  );
}
