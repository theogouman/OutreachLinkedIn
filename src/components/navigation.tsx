"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { IconeFile, IconeImport, IconeInbox, IconeProspects, IconeReglages } from "./icones";

const LIENS = [
  { href: "/", libelle: "Prospects", Icone: IconeProspects, compte: null },
  { href: "/inbox", libelle: "Inbox", Icone: IconeInbox, compte: "nonLus" },
  { href: "/file", libelle: "File d'attente", Icone: IconeFile, compte: "enAttente" },
  { href: "/import", libelle: "Import", Icone: IconeImport, compte: null },
  { href: "/reglages", libelle: "Réglages", Icone: IconeReglages, compte: null },
] as const;

const GLISSE = { type: "spring", stiffness: 520, damping: 40, mass: 0.6 } as const;

/** Navigation principale : page courante signalée (fond glissant), compteurs. */
export function Navigation({ comptes, horizontale = false }: { comptes: { nonLus: number; enAttente: number }; horizontale?: boolean }) {
  const chemin = usePathname();
  const reduit = useReducedMotion();
  const estActif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <nav aria-label="Navigation principale">
      <ul className={horizontale ? "flex gap-1 overflow-x-auto" : "flex flex-col gap-0.5"}>
        {LIENS.map(({ href, libelle, Icone, compte }) => {
          const actif = estActif(href);
          const n = compte ? comptes[compte] : 0;
          return (
            <li key={href} className="relative">
              {actif && (
                <motion.span
                  layoutId={horizontale ? "nav-actif-h" : "nav-actif"}
                  transition={reduit ? { duration: 0 } : GLISSE}
                  className="absolute inset-0 rounded-lg bg-carte shadow-[0_1px_2px_rgba(28,25,23,0.06)] ring-1 ring-trait"
                />
              )}
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 body-5 whitespace-nowrap outline-none transition-colors duration-200 focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] ${
                  actif ? "text-encre" : "text-encre-2 hover:text-encre"
                }`}
              >
                <Icone taille={18} className={actif ? "text-action" : "text-encre-3"} />
                <span>{libelle}</span>
                {n > 0 && (
                  <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center caption-3 tabular-nums ${compte === "nonLus" ? "bg-accent text-white" : "bg-black/5 text-encre-2"}`}>
                    {n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
