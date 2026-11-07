"use client";
/*
 * Adapté de interior (components/interior/drawer.tsx)
 * MIT License — Copyright (c) 2026 ozzy — https://github.com/ddoemonn/interior
 * Modifications : libellés français, charte de l'outil, rendu sans portail (position fixe),
 * glisser pour fermer retiré, piège de focus, Échap et retour du focus conservés.
 */

import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const OUVERTURE = { type: "spring", stiffness: 150, damping: 27, mass: 1 } as const;
const FERMETURE = { duration: 0.15, ease: [0.22, 1, 0.36, 1] } as const;
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface PanneauProps {
  ouvert: boolean;
  fermer: () => void;
  titre: string;
  description?: string;
  largeur?: number;
  children: ReactNode;
}

export function Panneau({ ouvert, fermer, titre, description, largeur = 480, children }: PanneauProps) {
  const reduit = useReducedMotion();
  const titreId = useId();
  const panneauRef = useRef<HTMLDivElement>(null);
  const retourFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const actif = document.activeElement;
    retourFocus.current = actif instanceof HTMLElement ? actif : null;
    const p = panneauRef.current;
    (p?.querySelector<HTMLElement>(FOCUSABLE) ?? p)?.focus({ preventScroll: true });
    const racine = document.documentElement;
    const debordement = racine.style.overflow;
    racine.style.overflow = "hidden";
    return () => {
      racine.style.overflow = debordement;
      const cible = retourFocus.current;
      if (cible?.isConnected) cible.focus({ preventScroll: true });
    };
  }, [ouvert]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fermer();
        return;
      }
      if (e.key !== "Tab" || !panneauRef.current) return;
      const noeuds = Array.from(panneauRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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
    },
    [fermer],
  );

  return (
    <AnimatePresence>
      {ouvert && (
        <div className="fixed inset-0 z-50">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-encre/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: FERMETURE }}
            onClick={fermer}
          />
          <motion.div
            ref={panneauRef}
            role="dialog"
            aria-modal
            aria-labelledby={titreId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{ width: largeur, maxWidth: "calc(100% - 40px)" }}
            className="absolute inset-y-0 right-0 flex flex-col rounded-l-[14px] border-l border-trait bg-carte shadow-[0_28px_56px_-24px_rgba(24,22,20,0.45)] outline-none"
            initial={reduit ? { opacity: 0 } : { x: largeur + 24 }}
            animate={reduit ? { opacity: 1 } : { x: 0 }}
            exit={reduit ? { opacity: 0 } : { x: largeur + 24, transition: FERMETURE }}
            transition={reduit ? { duration: 0 } : OUVERTURE}
          >
            <header className="flex items-start gap-3 border-b border-trait px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titreId} className="truncate heading-6 text-encre">{titre}</h2>
                {description && <p className="mt-0.5 truncate body-6 text-encre-3">{description}</p>}
              </div>
              <button
                type="button"
                onClick={fermer}
                aria-label="Fermer le panneau"
                className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-encre-3 hover:bg-creux hover:text-encre outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg width="13" height="13" viewBox="0 0 256 256" fill="none" aria-hidden>
                  <path d="M200 56 56 200M200 200 56 56" stroke="currentColor" strokeWidth="16" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
