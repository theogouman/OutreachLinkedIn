"use client";
/*
 * Adapté de interior (components/interior/sortable-table.tsx)
 * MIT License — Copyright (c) 2026 ozzy — https://github.com/ddoemonn/interior
 * Modifications : charte de l'outil, libellés et annonces en français, colonne de marquage
 * retirée, ligne cliquable (ouvre la fiche), tri local de la page affichée, comparaison fr,
 * lignes qui entrent et sortent animées quand la liste est filtrée (recherche en temps réel).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const CELLULE = { duration: 0.3, ease: [0.22, 1, 0.36, 1] } as const;
const PETIT = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
const CACHER = { duration: 0.12, ease: [0.4, 0, 1, 1] } as const;
const MONTRER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
const PAS = 0.018;
const PAS_MAX = 8;
const STABLE_MS = 380;
const SORTIE_LIGNE = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;

export type Sens = "asc" | "desc";
export type Tri = { colonne: string; sens: Sens };

export interface Colonne<T> {
  id: string;
  entete: string;
  largeur?: string;
  aDroite?: boolean;
  triable?: boolean;
  valeur?: (ligne: T) => string | number | null | undefined;
  cellule?: (ligne: T) => ReactNode;
}

export function TableTriable<T>({
  lignes,
  colonnes,
  idDe,
  libelle,
  hauteurLigne = 60,
  surLigne,
  vide,
}: {
  lignes: T[];
  colonnes: Colonne<T>[];
  idDe: (l: T) => string;
  libelle: string;
  hauteurLigne?: number;
  surLigne?: (l: T) => void;
  /** Contenu affiché quand aucune ligne ne reste (filtrage en cours). */
  vide?: ReactNode;
}) {
  const reduit = useReducedMotion();
  const [tri, setTri] = useState<Tri | null>(null);
  const [touche, setTouche] = useState(false);
  const [bouge, setBouge] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);

  const collator = useMemo(() => new Intl.Collator("fr", { numeric: true, sensitivity: "base" }), []);
  const valeurDe = useCallback((l: T, id: string) => colonnes.find((c) => c.id === id)?.valeur?.(l) ?? null, [colonnes]);

  const ordonnees = useMemo(() => {
    const base = lignes.map((l, i) => ({ id: idDe(l), l, i }));
    if (tri) {
      const d = tri.sens === "asc" ? 1 : -1;
      base.sort((x, y) => {
        const a = valeurDe(x.l, tri.colonne);
        const b = valeurDe(y.l, tri.colonne);
        const va = a === null || a === "";
        const vb = b === null || b === "";
        if (va || vb) return va && vb ? x.i - y.i : va ? 1 : -1;
        const r = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
        return r === 0 ? x.i - y.i : r * d;
      });
    }
    return base.map(({ id, l }, index) => ({ id, l, index }));
  }, [lignes, tri, idDe, valeurDe, collator]);

  const basculer = (id: string) => {
    setTouche(true);
    setTri((t) => (!t || t.colonne !== id ? { colonne: id, sens: "asc" } : t.sens === "asc" ? { colonne: id, sens: "desc" } : null));
    if (reduit) return;
    setBouge(true);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setBouge(false), STABLE_MS);
  };

  const gabarit = colonnes.map((c) => c.largeur ?? "minmax(0, 1fr)").join(" ");
  const actif = colonnes.find((c) => c.id === tri?.colonne)?.entete;
  const annonce = !touche ? "" : tri && actif ? `Trié par ${actif}, ${tri.sens === "asc" ? "croissant" : "décroissant"}.` : "Ordre initial rétabli.";

  return (
    <div className="carte overflow-hidden">
      <div className="overflow-x-auto">
        <div role="table" aria-label={libelle} aria-rowcount={lignes.length + 1} className="min-w-[760px]">
          <div role="rowgroup">
            <div role="row" className="grid h-10 items-center gap-x-3 border-b border-trait bg-creux px-4" style={{ gridTemplateColumns: gabarit }}>
              {colonnes.map((c) => {
                const etat = tri?.colonne === c.id ? (tri.sens === "asc" ? "ascending" : "descending") : "none";
                const estActif = etat !== "none";
                return (
                  <div key={c.id} role="columnheader" aria-sort={c.triable === false ? undefined : etat} className="min-w-0">
                    {c.triable === false ? (
                      <span className={`block truncate caption-4 text-encre-3 ${c.aDroite ? "text-right" : ""}`}>{c.entete}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => basculer(c.id)}
                        className={`group flex h-7 w-full items-center gap-1.5 rounded-md outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] ${c.aDroite ? "flex-row-reverse" : ""}`}
                      >
                        <span className={`truncate caption-4 ${estActif ? "text-encre" : "text-encre-3 group-hover:text-encre"}`}>
                          {c.entete}
                        </span>
                        <motion.span
                          aria-hidden
                          className="shrink-0 text-encre"
                          initial={false}
                          animate={{ rotate: etat === "descending" ? 180 : 0, opacity: estActif ? 1 : 0, scale: estActif ? 1 : 0.72 }}
                          transition={reduit ? { duration: 0 } : PETIT}
                        >
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                            <path d="M5 8.6V1.6M5 1.6 2.2 4.4M5 1.6l2.8 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </motion.span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <motion.div
            role="rowgroup"
            className="relative overflow-hidden"
            initial={false}
            animate={{ height: (lignes.length || 1) * hauteurLigne }}
            transition={reduit ? { duration: 0 } : CELLULE}
          >
            <AnimatePresence initial={false}>
              {ordonnees.map(({ id, l, index }) => (
                <motion.div
                  key={id}
                  role="row"
                  initial={reduit ? { opacity: 0, y: index * hauteurLigne } : { opacity: 0, y: index * hauteurLigne + 8 }}
                  animate={{ opacity: 1, y: index * hauteurLigne }}
                  exit={{ opacity: 0, transition: SORTIE_LIGNE }}
                  transition={reduit ? { duration: 0 } : { ...CELLULE, delay: Math.min(index, PAS_MAX) * PAS }}
                  onClick={surLigne ? () => surLigne(l) : undefined}
                  className={`absolute inset-x-0 top-0 grid items-center gap-x-3 px-4 transition-colors duration-200 ${surLigne ? "cursor-pointer hover:bg-creux" : ""}`}
                  style={{ height: hauteurLigne, gridTemplateColumns: gabarit }}
                >
                  {index > 0 && (
                    <motion.span
                      aria-hidden
                      initial={false}
                      animate={{ opacity: bouge ? 0 : 1 }}
                      transition={bouge ? CACHER : MONTRER}
                      className="pointer-events-none absolute inset-x-4 top-0 border-t border-trait"
                    />
                  )}
                  {colonnes.map((c) => {
                    const brut = c.valeur?.(l);
                    return (
                      <div key={c.id} role="cell" className={`min-w-0 body-6 text-encre-2 ${c.aDroite ? "text-right" : ""}`}>
                        {c.cellule ? c.cellule(l) : brut === null || brut === undefined || brut === "" ? "—" : String(brut)}
                      </div>
                    );
                  })}
                </motion.div>
              ))}
            </AnimatePresence>
            <AnimatePresence>
              {lignes.length === 0 && vide && (
                <motion.div
                  key="vide"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: MONTRER }}
                  exit={{ opacity: 0, transition: CACHER }}
                  className="absolute inset-0 grid place-items-center px-4"
                >
                  {vide}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {annonce}
      </div>
    </div>
  );
}
