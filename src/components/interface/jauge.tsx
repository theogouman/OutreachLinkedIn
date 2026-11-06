"use client";
/*
 * Adapté de interior (components/interior/progress-bar.tsx)
 * MIT License — Copyright (c) 2026 ozzy — https://github.com/ddoemonn/interior
 * Modifications : role="meter" (consommation d'un quota, pas une progression), valeur
 * « consommé / plafond » en texte, seuils 80 % et 100 % signalés par le libellé et la
 * couleur, état « gelé », charte de l'outil, pas de mode indéterminé.
 */

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

const REMPLISSAGE = { type: "spring", stiffness: 210, damping: 34, mass: 0.9 } as const;
const IMMEDIAT = { duration: 0 } as const;

export interface JaugeProps {
  libelle: string;
  valeur: number;
  max: number;
  unite: string;
  gele?: boolean;
}

export function Jauge({ libelle, valeur, max, unite, gele = false }: JaugeProps) {
  const reduit = useReducedMotion();
  const id = useId();
  const fraction = max <= 0 ? 1 : Math.min(1, Math.max(0, valeur / max));
  const atteint = fraction >= 1;
  const proche = !atteint && fraction >= 0.8;
  const etat = gele ? "gelé" : atteint ? "atteint" : proche ? "bientôt atteint" : null;
  const couleur = gele ? "bg-amber-400" : atteint ? "bg-[#b5443d]" : "bg-[#e0625a]";

  return (
    <div className="flex min-w-[8.5rem] flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span id={id} className="truncate text-neutral-600">{libelle}</span>
        <span className={`shrink-0 tabular-nums ${gele ? "text-amber-700" : atteint ? "text-[#b5443d]" : "text-neutral-800"}`}>
          {gele ? "gelé" : `${valeur}/${max} ${unite}`}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={valeur}
        aria-valuetext={`${valeur} sur ${max} ${unite}${etat ? `, ${etat}` : ""}`}
        className="rounded-[4px] bg-neutral-200/70 p-[2px] shadow-[inset_0_1px_2px_rgba(28,25,23,0.08)]"
      >
        <div className="relative h-[6px] overflow-hidden rounded-[2px]">
          <motion.span
            aria-hidden
            className={`absolute inset-0 block origin-left rounded-[2px] ${couleur}`}
            initial={false}
            animate={{ scaleX: fraction }}
            transition={reduit ? IMMEDIAT : REMPLISSAGE}
          />
        </div>
      </div>
    </div>
  );
}
