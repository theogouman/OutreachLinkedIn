"use client";
/*
 * Adapté de interior (components/interior/segmented-control.tsx)
 * MIT License — Copyright (c) 2026 ozzy — https://github.com/ddoemonn/interior
 * Modifications : charte de l'outil, compteurs facultatifs, contrôlé uniquement,
 * pas d'écriture de ref pendant le rendu, libellés français.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

const CELLULE = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const SEG = "px-3 py-1.5 text-center text-sm leading-5 font-medium whitespace-nowrap";

export interface OptionSegment {
  valeur: string;
  libelle: string;
  compte?: number;
}

export function ControleSegmente({
  options,
  valeur,
  libelle,
  onChange,
}: {
  options: OptionSegment[];
  valeur: string;
  libelle: string;
  onChange: (valeur: string) => void;
}) {
  const n = Math.max(1, options.length);
  const gabarit = `repeat(${n}, minmax(0, 1fr))`;
  const trouve = options.findIndex((o) => o.valeur === valeur);
  const index = trouve < 0 ? 0 : trouve;
  const [survol, setSurvol] = useState(-1);
  const boutons = useRef<(HTMLButtonElement | null)[]>([]);

  const reduit = useReducedMotion();
  const pos = useMotionValue(index);
  const xPastille = useTransform(pos, (v) => `${v * 100}%`);
  const xMasque = useTransform(pos, (v) => `${v * -100}%`);

  useEffect(() => {
    if (reduit) {
      pos.set(index);
      return;
    }
    const c = animate(pos, index, CELLULE);
    return () => c.stop();
  }, [index, reduit, pos]);

  const aller = (i: number) => {
    const o = options[(i + n) % n];
    if (!o) return;
    boutons.current[(i + n) % n]?.focus();
    if (o.valeur !== valeur) onChange(o.valeur);
  };

  const clavier = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      aller(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      aller(i - 1);
    }
  };

  const contenu = (o: OptionSegment, actif: boolean) => (
    <>
      {o.libelle}
      {o.compte !== undefined && (
        <span className={`ml-1.5 tabular-nums ${actif ? "text-white/70" : "text-encre-3"}`}>{o.compte}</span>
      )}
    </>
  );

  return (
    <div
      role="radiogroup"
      aria-label={libelle}
      className="relative inline-block max-w-full select-none overflow-x-auto rounded-xl border border-trait bg-creux p-[3px]"
    >
      <div className="relative grid" style={{ gridTemplateColumns: gabarit, touchAction: "manipulation" }}>
        {options.map((o, i) => (
          <span
            key={o.valeur}
            aria-hidden
            className={`${SEG} pointer-events-none ${survol === i && i !== index ? "text-encre" : "text-encre-2"}`}
          >
            {contenu(o, false)}
          </span>
        ))}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-lg bg-encre shadow-[0_1px_2px_rgba(28,25,23,0.28)]"
          style={{ width: `${100 / n}%`, x: xPastille }}
          initial={false}
        >
          <motion.div className="absolute inset-0" style={{ x: xMasque }} initial={false}>
            <div className="absolute inset-y-0 left-0 grid" style={{ width: `${n * 100}%`, gridTemplateColumns: gabarit }}>
              {options.map((o) => (
                <span key={o.valeur} className={`${SEG} text-white`}>
                  {contenu(o, true)}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: gabarit }} onPointerLeave={() => setSurvol(-1)}>
          {options.map((o, i) => (
            <button
              key={o.valeur}
              ref={(el) => {
                boutons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={i === index}
              tabIndex={i === index ? 0 : -1}
              onClick={() => o.valeur !== valeur && onChange(o.valeur)}
              onKeyDown={(e) => clavier(e, i)}
              onPointerEnter={() => setSurvol(i)}
              className="rounded-lg outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]"
            >
              <span className="sr-only">
                {o.libelle}
                {o.compte !== undefined ? ` (${o.compte})` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
