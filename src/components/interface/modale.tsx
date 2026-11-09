"use client";
/*
 * Modale centrée, arrière-plan flouté.
 * Animation : Transitions.dev « Modal open / close » (classes .t-modal / .is-open / .is-closing,
 * globals.css). Accessibilité reprise du panneau (interior) : piège de focus, Échap, défilement
 * de la page bloqué, focus rendu à l'élément d'origine à la fermeture.
 * Sur téléphone (< 640 px) : panneau qui monte du bas, avec poignée ; on le ferme en le faisant
 * glisser vers le bas (au-delà de 120 px ou d'un geste rapide), sinon il revient en place.
 * `hauteurFixe` : la modale garde la même taille quel que soit le contenu (min(760 px, écran)) ;
 * le corps ne défile pas, c'est au contenu de gérer son propre défilement.
 */

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FERMETURE_MS = 150; // --modal-close-dur
const FERMETURE_PANNEAU_MS = 260; // panneau du bas (globals.css, max-width: 639px)
const SEUIL_GLISSER_PX = 120;
const estTelephone = () => window.matchMedia("(max-width: 639px)").matches;

type Etat = "entree" | "ouverte" | "sortie";

const Contexte = createContext<{ fermer: () => void; titreId: string } | null>(null);

/** Fermeture animée et identifiant du titre, pour l'en-tête et le contenu de la modale. */
export function useModale() {
  const c = useContext(Contexte);
  if (!c) throw new Error("useModale doit être utilisé dans <Modale>");
  return c;
}

export function Modale({
  fermer,
  enTete,
  children,
  largeur = 720,
  hauteurFixe = false,
}: {
  /** Appelé une fois l'animation de fermeture terminée. */
  fermer: () => void;
  /** En-tête fixe (titre portant l'id `titreId` de useModale, actions). */
  enTete: ReactNode;
  children: ReactNode;
  largeur?: number;
  /** Taille fixe : le contenu défile à l'intérieur de ses propres zones, jamais la modale. */
  hauteurFixe?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>("entree");
  const titreId = useId();
  const boite = useRef<HTMLDivElement>(null);
  const retourFocus = useRef<HTMLElement | null>(null);
  const minuteur = useRef<number | undefined>(undefined);

  // Une image après le montage : passe à « ouverte » pour que la transition d'entrée joue.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEtat("ouverte"));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const actif = document.activeElement;
    retourFocus.current = actif instanceof HTMLElement ? actif : null;
    const b = boite.current;
    b?.focus({ preventScroll: true }); // la boîte elle-même : pas d'anneau sur un bouton à l'ouverture
    const racine = document.documentElement;
    const debordement = racine.style.overflow;
    racine.style.overflow = "hidden";
    return () => {
      racine.style.overflow = debordement;
      window.clearTimeout(minuteur.current);
      const cible = retourFocus.current;
      if (cible?.isConnected) cible.focus({ preventScroll: true });
    };
  }, []);

  const fermerAnime = useCallback(() => {
    setEtat("sortie");
    window.clearTimeout(minuteur.current);
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const b = boite.current;
    if (b) {
      // Après un glisser, la fermeture repart de la position du doigt.
      b.style.transition = "";
      b.style.transform = "";
    }
    minuteur.current = window.setTimeout(fermer, reduit ? 0 : estTelephone() ? FERMETURE_PANNEAU_MS : FERMETURE_MS);
  }, [fermer]);

  // ── Glisser pour fermer (téléphone) ──
  const glisse = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const debutGlisser = (e: PointerEvent<HTMLDivElement>) => {
    if (!estTelephone() || e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("a,button,input,textarea,select,label")) return;
    glisse.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (boite.current) boite.current.style.transition = "none";
  };
  const pendantGlisser = (e: PointerEvent<HTMLDivElement>) => {
    const g = glisse.current;
    if (!g || !boite.current) return;
    g.dy = Math.max(0, e.clientY - g.y0); // vers le bas seulement
    boite.current.style.transform = `translateY(${g.dy}px)`;
  };
  const finGlisser = () => {
    const g = glisse.current;
    glisse.current = null;
    if (!g || !boite.current) return;
    const vitesse = g.dy / Math.max(1, performance.now() - g.t0); // px / ms
    boite.current.style.transition = "";
    boite.current.style.transform = "";
    if (g.dy > SEUIL_GLISSER_PX || (g.dy > 30 && vitesse > 0.6)) fermerAnime();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      fermerAnime();
      return;
    }
    if (e.key !== "Tab" || !boite.current) return;
    const noeuds = Array.from(boite.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (noeuds.length === 0) return e.preventDefault();
    const premier = noeuds[0]!;
    const dernier = noeuds[noeuds.length - 1]!;
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const classeEtat = etat === "ouverte" ? " is-open" : etat === "sortie" ? " is-closing" : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end pt-[max(12px,env(safe-area-inset-top))] sm:place-items-center sm:p-6">
      <div aria-hidden className={`t-modal-fond absolute inset-0${classeEtat}`} onClick={fermerAnime} />
      <div
        ref={boite}
        role="dialog"
        aria-modal
        aria-labelledby={titreId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ maxWidth: largeur }}
        className={`t-modal${classeEtat} relative flex ${hauteurFixe ? "h-[92dvh] sm:h-[min(760px,calc(100dvh-48px))]" : "max-h-[92dvh]"} w-full flex-col overflow-hidden rounded-t-[24px] bg-carte pb-[env(safe-area-inset-bottom)] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.04)] outline-none sm:max-h-full sm:rounded-[24px] sm:pb-0`}
      >
        <Contexte value={{ fermer: fermerAnime, titreId }}>
          {/* Zone de prise (téléphone) : poignée et en-tête se glissent vers le bas pour fermer. */}
          <div
            className="shrink-0 touch-none sm:touch-auto"
            onPointerDown={debutGlisser}
            onPointerMove={pendantGlisser}
            onPointerUp={finGlisser}
            onPointerCancel={finGlisser}
          >
            <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-trait-fort sm:hidden" />
            {enTete}
          </div>
          <div className={`flex min-h-0 flex-1 flex-col ${hauteurFixe ? "" : "overflow-y-auto overscroll-contain"}`}>{children}</div>
        </Contexte>
      </div>
    </div>
  );
}
