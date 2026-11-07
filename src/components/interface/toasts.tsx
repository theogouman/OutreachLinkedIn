"use client";
/*
 * Adapté de ui-components (components/motion/animated-toast-stack.tsx)
 * MIT License — Copyright (c) 2026 Saurabh Chauhan — https://github.com/starc007/ui-components
 * Modifications : icônes SVG en ligne (sans lucide-react), charte de l'outil, libellés
 * français, contexte global, pas de portail ni de glisser pour fermer, erreurs persistantes.
 */

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type StatutToast = "info" | "succes" | "erreur";

export interface Toast {
  id: string;
  titre: string;
  description?: string;
  statut: StatutToast;
  /** ms ; 0 = reste affiché jusqu'à fermeture. */
  duree: number;
}

type Entree = Omit<Toast, "id" | "duree" | "statut"> & { statut?: StatutToast; duree?: number };

const ToastsContexte = createContext<((t: Entree) => void) | null>(null);

const RESSORT: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.75 };
const SORTIE = { duration: 0.15, ease: [0.22, 1, 0.36, 1] } as const;

const ICONES: Record<StatutToast, ReactNode> = {
  info: (
    <svg viewBox="0 0 256 256" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm8 152a8 8 0 0 1-16 0v-48a8 8 0 0 1 16 0Zm-8-80a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" />
    </svg>
  ),
  succes: (
    <svg viewBox="0 0 256 256" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M40 144l56 56L216 72" />
    </svg>
  ),
  erreur: (
    <svg viewBox="0 0 256 256" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm-8 56a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 104a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" />
    </svg>
  ),
};

const COULEUR: Record<StatutToast, string> = {
  info: "bg-creux text-encre-2",
  succes: "bg-emerald-50 text-emerald-700",
  erreur: "bg-accent-doux text-action",
};

let graine = 0;

export function FournisseurToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const minuteurs = useRef(new Map<string, number>());

  const fermer = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const m = minuteurs.current.get(id);
    if (m) window.clearTimeout(m);
    minuteurs.current.delete(id);
  }, []);

  const afficher = useCallback(
    (e: Entree) => {
      const statut = e.statut ?? "info";
      const toast: Toast = { ...e, statut, id: `t${++graine}`, duree: e.duree ?? (statut === "erreur" ? 0 : 4000) };
      setToasts((t) => [...t, toast].slice(-4));
      if (toast.duree > 0) minuteurs.current.set(toast.id, window.setTimeout(() => fermer(toast.id), toast.duree));
    },
    [fermer],
  );

  useEffect(() => {
    const m = minuteurs.current;
    return () => m.forEach((t) => window.clearTimeout(t));
  }, []);

  const valeur = useMemo(() => afficher, [afficher]);

  return (
    <ToastsContexte value={valeur}>
      {children}
      <Pile toasts={toasts} fermer={fermer} />
    </ToastsContexte>
  );
}

export function useToasts() {
  const afficher = useContext(ToastsContexte);
  if (!afficher) throw new Error("useToasts doit être utilisé sous <FournisseurToasts>");
  return afficher;
}

/** Affiche le retour d'une Server Action : succès 4 s, erreur jusqu'à fermeture. */
export function useRetour() {
  const afficher = useToasts();
  return useCallback(
    (r: { ok: boolean; message: string }) => afficher({ titre: r.message, statut: r.ok ? "succes" : "erreur" }),
    [afficher],
  );
}

function Pile({ toasts, fermer }: { toasts: Toast[]; fermer: (id: string) => void }) {
  const reduit = useReducedMotion();
  return (
    <ol aria-live="polite" className="pointer-events-none fixed bottom-6 right-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col-reverse gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((t, i) => (
          <motion.li
            key={t.id}
            layout
            role={t.statut === "erreur" ? "alert" : "status"}
            initial={reduit ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96 }}
            animate={reduit ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduit ? { opacity: 0 } : { opacity: 0, x: 32, scale: 0.96, transition: SORTIE }}
            transition={RESSORT}
            className="pointer-events-auto"
            style={{ zIndex: 20 - i }}
          >
            <div className="flex items-start gap-3 rounded-2xl border border-trait bg-carte/95 p-3 shadow-[0_16px_40px_-16px_rgb(28_25_23/0.35)] backdrop-blur">
              <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${COULEUR[t.statut]}`}>
                {ICONES[t.statut]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="title-4 text-encre">{t.titre}</p>
                {t.description && <p className="mt-0.5 caption-5 text-encre-2">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => fermer(t.id)}
                aria-label="Fermer la notification"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-encre-3 hover:bg-creux"
              >
                <svg viewBox="0 0 256 256" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={20} strokeLinecap="round" aria-hidden>
                  <path d="M200 56 56 200M200 200 56 56" />
                </svg>
              </button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
