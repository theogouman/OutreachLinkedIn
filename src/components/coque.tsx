"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { titreDe } from "./navigation";

const SORTIE = [0.25, 1, 0.5, 1] as const;

/**
 * Coque de l'application (sales-crm) : barre latérale fixe sur grand écran, tiroir sur mobile,
 * en-tête compact avec le titre de la page et les actions à droite.
 */
export function Coque({ barre, entete, pastille, children }: { barre: ReactNode; entete: ReactNode; pastille?: ReactNode; children: ReactNode }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [cheminOuvert, setCheminOuvert] = useState(chemin);
  const reduit = useReducedMotion();

  // Ferme le tiroir à chaque navigation (ajusté pendant le rendu, sans effet).
  if (cheminOuvert !== chemin) {
    setCheminOuvert(chemin);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-carte focus:px-4 focus:py-2 focus:body-5"
      >
        Aller au contenu
      </a>

      <aside className="sticky top-0 hidden h-dvh w-[254px] shrink-0 border-r border-trait bg-barre lg:block">{barre}</aside>

      <AnimatePresence>
        {ouvert && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal aria-label="Navigation">
            <motion.div
              className="absolute inset-0 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOuvert(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[min(280px,85vw)] border-r border-trait bg-barre pt-[env(safe-area-inset-top)]"
              initial={reduit ? { opacity: 0 } : { x: "-100%" }}
              animate={reduit ? { opacity: 1 } : { x: 0 }}
              exit={reduit ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.3, ease: SORTIE }}
            >
              {barre}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-trait bg-surface/95 px-4 pb-[14px] pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="bouton bouton-icone lg:hidden"
              aria-label="Ouvrir la navigation"
              aria-expanded={ouvert}
              onClick={() => setOuvert(true)}
            >
              <svg viewBox="0 0 256 256" className="size-3.5" fill="currentColor" aria-hidden>
                <path d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8ZM40 72h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16Zm176 112H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16Z" />
              </svg>
            </button>
            <h1 className="truncate heading-5 text-encre">{titreDe(chemin)}</h1>
            {pastille}
          </div>
          {entete}
        </header>
        <main id="contenu" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
