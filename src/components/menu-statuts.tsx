"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const POINT = {
  en_cours: { couleur: "bg-emerald-500", halo: "bg-emerald-500/40", libelle: "File active" },
  en_pause: { couleur: "bg-encre-3", halo: "bg-encre-3/30", libelle: "File en pause" },
  gele: { couleur: "bg-amber-500", halo: "bg-amber-500/40", libelle: "Action gelée 24 h" },
} as const;

/**
 * Menu « Statuts » de la barre de navigation : point clignotant à la couleur de la file,
 * panneau des quotas ouvert au survol (avec un court délai de fermeture), au focus clavier
 * ou au toucher. Échap ferme et rend le focus au bouton.
 */
export function MenuStatuts({ etatFile, alerte, children }: { etatFile: keyof typeof POINT; alerte: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const reduit = useReducedMotion();
  const panneauId = useId();
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const p = POINT[etatFile];

  const ouvrir = useCallback(() => {
    window.clearTimeout(minuteur.current);
    setOuvert(true);
  }, []);
  const fermerBientot = useCallback(() => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setOuvert(false), 160);
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  return (
    <div
      ref={racine}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && ouvrir()}
      onPointerLeave={(e) => e.pointerType === "mouse" && fermerBientot()}
      onFocus={ouvrir}
      onBlur={(e) => {
        if (!racine.current?.contains(e.relatedTarget as Node | null)) fermerBientot();
      }}
    >
      <button
        ref={bouton}
        type="button"
        aria-expanded={ouvert}
        aria-controls={panneauId}
        aria-label={`Statuts : ${p.libelle}${alerte ? ", à vérifier" : ""}`}
        title="Statuts"
        onClick={() => setOuvert((o) => !o)}
        className="bouton bouton-discret size-9 p-0"
      >
        <span className="relative flex size-2.5" aria-hidden>
          <span className={`absolute inline-flex size-full rounded-full ${p.halo} ${etatFile === "en_pause" ? "" : "animate-ping"}`} />
          <span className={`relative inline-flex size-2.5 rounded-full ${p.couleur} ${etatFile === "en_pause" ? "" : "animate-pulse"}`} />
        </span>
        {alerte && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-action" aria-hidden />}
      </button>
      <AnimatePresence>
        {ouvert && (
          <motion.div
            id={panneauId}
            role="region"
            aria-label="Statuts de la file et quotas"
            initial={reduit ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduit ? { opacity: 0 } : { opacity: 0, y: -2, scale: 0.99, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "top right" }}
            className="flottant absolute right-0 top-[calc(100%+10px)] z-50 w-[min(340px,calc(100vw-24px))] rounded-[20px] p-4"
          >
            {/* Pont invisible : le pointeur passe du bouton au panneau sans le fermer. */}
            <span className="absolute -top-3 left-0 h-3 w-full" aria-hidden />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
