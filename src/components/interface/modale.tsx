"use client";
/*
 * Modale centrée, arrière-plan flouté.
 * Animation : Transitions.dev « Modal open / close » (classes .t-modal / .is-open / .is-closing,
 * globals.css). Accessibilité reprise du panneau (interior) : piège de focus, Échap, défilement
 * de la page bloqué, focus rendu à l'élément d'origine à la fermeture.
 * Sur téléphone (< 640 px) : panneau qui monte du bas, avec poignée. Gestes (comme une feuille iOS),
 * depuis n'importe où dans le panneau, direction décidée dans les premiers pixels :
 * - vers le bas : ferme (au-delà de 120 px ou d'un geste rapide), seulement si la zone qui défile
 *   sous le doigt est déjà en haut ; sinon c'est un défilement normal ;
 * - à gauche / à droite (`glisserHorizontal`) : élément suivant / précédent, en carrousel. Les voisins
 *   (`voisins`, rendus inertes) sont collés de part et d'autre dans le même cadre : tout suit le doigt
 *   1:1 (résistance s'il n'y a rien de ce côté), puis l'animation repart de la vitesse du geste et
 *   décélère (courbe ease-out, sans rebond), sans jamais laisser voir le fond entre deux fiches.
 * `hauteurFixe` : la modale garde la même taille quel que soit le contenu (min(760 px, écran)) ;
 * le corps ne défile pas, c'est au contenu de gérer son propre défilement.
 */

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FERMETURE_MS = 150; // --modal-close-dur
const FERMETURE_PANNEAU_MS = 260; // panneau du bas (globals.css, max-width: 639px)
const SEUIL_GLISSER_PX = 120;
const SEUIL_HORIZONTAL_PX = 80;
const DECISION_PX = 8;
/** Éléments qui gardent leurs gestes (saisie, barre d'onglets qui défile). */
const SANS_GESTE = "input,textarea,select,[contenteditable='true'],.t-tabs,[data-sans-geste]";
const estTelephone = () => window.matchMedia("(max-width: 639px)").matches;

type Etat = "entree" | "ouverte" | "sortie";
export type Apercu = { enTete: ReactNode; contenu: ReactNode };

/** Décélération du carrousel : rapide au départ (prend le relais du doigt), longue fin douce. */
const COURBE_CARROUSEL = "cubic-bezier(0.18, 0.89, 0.32, 1)";

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
  glisserHorizontal,
  voisins,
}: {
  /** Appelé une fois l'animation de fermeture terminée. */
  fermer: () => void;
  /** En-tête fixe (titre portant l'id `titreId` de useModale, actions). */
  enTete: ReactNode;
  children: ReactNode;
  largeur?: number;
  /** Taille fixe : le contenu défile à l'intérieur de ses propres zones, jamais la modale. */
  hauteurFixe?: boolean;
  /** Glisser horizontal (téléphone) : élément précédent (vers la droite) / suivant (vers la gauche). */
  glisserHorizontal?: { precedent?: () => void; suivant?: () => void };
  /** Aperçus des éléments voisins (en-tête + contenu), collés de part et d'autre pendant le glisser. */
  voisins?: { precedent?: Apercu; suivant?: Apercu };
}) {
  const [etat, setEtat] = useState<Etat>("entree");
  const titreId = useId();
  const boite = useRef<HTMLDivElement>(null);
  const piste = useRef<HTMLDivElement>(null);
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

  // ── Gestes tactiles (téléphone) ──
  const horizontal = useRef(glisserHorizontal);
  useEffect(() => {
    horizontal.current = glisserHorizontal;
  });
  useEffect(() => {
    const b = boite.current;
    if (!b) return;
    type Geste = { x0: number; y0: number; t0: number; mode: "?" | "fermer" | "naviguer" | "natif"; dx: number; dy: number };
    let g: Geste | null = null;
    let animation = false;

    /** La zone qui défile sous le doigt est-elle déjà en haut (ou n'existe pas) ? */
    const enHaut = (cible: EventTarget | null) => {
      for (let n = cible instanceof Element ? cible : null; n && n !== b; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) return n.scrollTop <= 0;
      }
      return true;
    };
    /** Fermeture : le panneau entier descend. */
    const placerY = (y: number, avecTransition: boolean) => {
      b.style.transition = avecTransition ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      b.style.transform = y ? `translateY(${y}px)` : "";
    };
    /** Carrousel : la piste (fiche + voisines collées) se déplace dans le cadre du panneau. */
    const placerX = (x: number, duree = 0) => {
      const p = piste.current;
      if (!p) return;
      p.style.transition = duree ? `transform ${duree}ms ${COURBE_CARROUSEL}` : "none";
      p.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
    };

    const debut = (e: TouchEvent) => {
      if (!estTelephone() || animation || e.touches.length !== 1) return;
      if ((e.target as Element | null)?.closest(SANS_GESTE)) return;
      const t = e.touches[0]!;
      g = { x0: t.clientX, y0: t.clientY, t0: performance.now(), mode: "?", dx: 0, dy: 0 };
    };
    const mouvement = (e: TouchEvent) => {
      if (!g || g.mode === "natif") return;
      const t = e.touches[0]!;
      g.dx = t.clientX - g.x0;
      g.dy = t.clientY - g.y0;
      if (g.mode === "?") {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax < DECISION_PX && ay < DECISION_PX) return;
        const nav = horizontal.current;
        if (ay > ax && g.dy > 0 && enHaut(e.target)) g.mode = "fermer";
        else if (ax > ay * 1.2 && nav && (nav.precedent || nav.suivant)) g.mode = "naviguer";
        else {
          g.mode = "natif";
          return;
        }
      }
      e.preventDefault(); // le geste est pour le panneau : pas de défilement en même temps
      if (g.mode === "fermer") placerY(Math.max(0, g.dy), false);
      else {
        const nav = horizontal.current;
        // Pas d'élément de ce côté : résistance progressive (le contenu suit de moins en moins).
        const possible = g.dx < 0 ? !!nav?.suivant : !!nav?.precedent;
        const largeur = b.clientWidth;
        placerX(possible ? Math.max(-largeur, Math.min(largeur, g.dx)) : g.dx / (1 + Math.abs(g.dx) / 60) / 1.5);
      }
    };
    const fin = () => {
      const geste = g;
      g = null;
      if (!geste || geste.mode === "?" || geste.mode === "natif") return;
      const duree = Math.max(1, performance.now() - geste.t0);
      if (geste.mode === "fermer") {
        placerY(0, true);
        const vitesseY = geste.dy / duree;
        if (geste.dy > SEUIL_GLISSER_PX || (geste.dy > 30 && vitesseY > 0.6)) fermerAnime();
        return;
      }
      const nav = horizontal.current;
      const action = geste.dx < 0 ? nav?.suivant : nav?.precedent;
      const largeur = b.clientWidth;
      // Vitesse du doigt (px / ms) : un geste vif suffit, même court.
      const vitesse = Math.abs(geste.dx) / duree;
      const valide = !!action && (Math.abs(geste.dx) > Math.min(SEUIL_HORIZONTAL_PX, largeur * 0.25) || (Math.abs(geste.dx) > 24 && vitesse > 0.45));
      if (!valide) {
        placerX(0, 300); // retour en place, même courbe
        return;
      }
      const sens = geste.dx < 0 ? -1 : 1;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        placerX(0);
        flushSync(() => action!());
        return;
      }
      // Durée tirée de la distance restante et de la vitesse : l'animation prolonge le geste.
      const reste = largeur - Math.abs(geste.dx);
      const dureeAnim = Math.round(Math.min(420, Math.max(200, (reste / Math.max(vitesse, 0.9)) * 1.6)));
      animation = true;
      placerX(sens * largeur, dureeAnim);
      window.setTimeout(() => {
        // La voisine est arrivée au centre : elle devient la fiche affichée, au même endroit,
        // puis la piste revient à zéro dans la même image (aucun saut visible).
        flushSync(() => action!());
        placerX(0);
        animation = false;
      }, dureeAnim + 16);
    };

    b.addEventListener("touchstart", debut, { passive: true });
    b.addEventListener("touchmove", mouvement, { passive: false });
    b.addEventListener("touchend", fin);
    b.addEventListener("touchcancel", fin);
    return () => {
      b.removeEventListener("touchstart", debut);
      b.removeEventListener("touchmove", mouvement);
      b.removeEventListener("touchend", fin);
      b.removeEventListener("touchcancel", fin);
    };
  }, [fermerAnime]);

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
          {/* Piste du carrousel : la fiche, et ses voisines collées de part et d'autre (inertes). */}
          <div ref={piste} className="relative flex min-h-0 flex-1 flex-col">
            {/* Poignée et en-tête (téléphone) : toute la fiche se glisse (gestes ci-dessus). */}
            <div className="shrink-0">
              <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-trait-fort sm:hidden" />
              {enTete}
            </div>
            <div className={`flex min-h-0 flex-1 flex-col ${hauteurFixe ? "" : "overflow-y-auto overscroll-contain"}`}>{children}</div>
            {voisins?.precedent && <PanneauVoisin apercu={voisins.precedent} cote="precedent" />}
            {voisins?.suivant && <PanneauVoisin apercu={voisins.suivant} cote="suivant" />}
          </div>
        </Contexte>
      </div>
    </div>
  );
}

/** Aperçu inerte d'un voisin, collé à gauche (précédent) ou à droite (suivant) de la fiche. */
function PanneauVoisin({ apercu, cote }: { apercu: Apercu; cote: "precedent" | "suivant" }) {
  return (
    <div
      aria-hidden
      inert
      className={`absolute inset-y-0 flex w-full flex-col bg-carte ${cote === "precedent" ? "right-full border-r" : "left-full border-l"} border-trait`}
    >
      <div className="shrink-0">
        <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-trait-fort sm:hidden" />
        {apercu.enTete}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{apercu.contenu}</div>
    </div>
  );
}
