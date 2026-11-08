"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { IconeFile, IconeImport, IconeInbox, IconeProspects, IconeReglages, IconeStatistiques } from "./icones";

const LIENS = [
  { href: "/", libelle: "Prospects", Icone: IconeProspects, compte: null },
  { href: "/inbox", libelle: "Inbox", Icone: IconeInbox, compte: "nonLus" },
  { href: "/file", libelle: "File", Icone: IconeFile, compte: "enAttente" },
  { href: "/statistiques", libelle: "Stats", Icone: IconeStatistiques, compte: null },
  { href: "/import", libelle: "Import", Icone: IconeImport, compte: null },
  { href: "/reglages", libelle: "Réglages", Icone: IconeReglages, compte: null },
] as const;

/* Pilule glissante NC : 220 ms, courbe nc-ease. */
const GLISSE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

type Comptes = { nonLus: number; enAttente: number };

/**
 * Navigation principale (DA Notion Club) : pilule glissante sous l'onglet actif.
 * « haut » : barre flottante desktop ; « bas » : barre de pouce mobile.
 */
export function Navigation({ comptes, variante }: { comptes: Comptes; variante: "haut" | "bas" }) {
  const chemin = usePathname();
  const reduit = useReducedMotion();
  const estActif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const bas = variante === "bas";

  return (
    <nav aria-label="Navigation principale">
      <ul className={bas ? "flex items-stretch justify-between gap-1" : "flex items-center gap-0.5"}>
        {LIENS.map(({ href, libelle, Icone, compte }) => {
          const actif = estActif(href);
          const n = compte ? comptes[compte] : 0;
          return (
            <li key={href} className={`relative ${bas ? "flex-1" : ""}`}>
              {actif && (
                <motion.span
                  layoutId={`nav-actif-${variante}`}
                  transition={reduit ? { duration: 0 } : GLISSE}
                  className="absolute inset-0 rounded-full bg-black/[0.07]"
                />
              )}
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                aria-label={n > 0 ? `${libelle} (${n})` : undefined}
                className={`relative flex items-center rounded-full whitespace-nowrap text-encre outline-none transition-colors duration-150 focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] ${
                  bas ? "flex-col gap-0.5 px-2 py-1.5 text-[11px]" : "gap-2 px-4 py-2 text-sm"
                } ${actif ? "font-semibold" : "font-normal hover:bg-black/[0.04]"}`}
              >
                <span className="relative">
                  <Icone taille={bas ? 20 : 17} />
                  {n > 0 && bas && (
                    <span className={`absolute -right-2 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 tabular-nums ${compte === "nonLus" ? "bg-action text-white" : "bg-sombre text-white"}`}>
                      {n}
                    </span>
                  )}
                </span>
                <span>{libelle}</span>
                {n > 0 && !bas && (
                  <span className={`min-w-5 rounded-full px-1.5 text-center caption-3 tabular-nums ${compte === "nonLus" ? "bg-action text-white" : "bg-black/[0.06] text-encre-2"}`}>
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
