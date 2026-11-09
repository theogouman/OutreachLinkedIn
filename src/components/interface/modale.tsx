"use client";
/*
 * Modale centrée, arrière-plan flouté.
 * Animation : Transitions.dev « Modal open / close » (classes .t-modal / .is-open / .is-closing,
 * globals.css). Accessibilité reprise du panneau (interior) : piège de focus, Échap, défilement
 * de la page bloqué, focus rendu à l'élément d'origine à la fermeture.
 */

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FERMETURE_MS = 150; // --modal-close-dur

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
}: {
  /** Appelé une fois l'animation de fermeture terminée. */
  fermer: () => void;
  /** En-tête fixe (titre portant l'id `titreId` de useModale, actions). */
  enTete: ReactNode;
  children: ReactNode;
  largeur?: number;
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
    minuteur.current = window.setTimeout(fermer, reduit ? 0 : FERMETURE_MS);
  }, [fermer]);

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
    <div className="fixed inset-0 z-50 grid place-items-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:p-6">
      <div aria-hidden className={`t-modal-fond absolute inset-0${classeEtat}`} onClick={fermerAnime} />
      <div
        ref={boite}
        role="dialog"
        aria-modal
        aria-labelledby={titreId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ maxWidth: largeur }}
        className={`t-modal${classeEtat} relative flex max-h-full w-full flex-col overflow-hidden rounded-[24px] bg-carte shadow-[0_24px_64px_-16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.04)] outline-none`}
      >
        <Contexte value={{ fermer: fermerAnime, titreId }}>
          {enTete}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </Contexte>
      </div>
    </div>
  );
}
