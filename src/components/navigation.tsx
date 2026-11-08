"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  IconeFile,
  IconeImport,
  IconeInbox,
  IconeProspects,
  IconeReglages,
  IconeStatistiques,
} from "./icones";

type Icone = ComponentType<SVGProps<SVGSVGElement> & { taille?: number }>;
type Comptes = { nonLus: number; enAttente: number };
type Lien = { href: string; libelle: string; Icone: Icone; compte?: keyof Comptes };

const SECTIONS: { titre?: string; liens: Lien[] }[] = [
  {
    liens: [
      { href: "/", libelle: "Prospects", Icone: IconeProspects },
      { href: "/inbox", libelle: "Inbox", Icone: IconeInbox, compte: "nonLus" },
      { href: "/file", libelle: "File d'attente", Icone: IconeFile, compte: "enAttente" },
    ],
  },
  { titre: "Analyse", liens: [{ href: "/statistiques", libelle: "Statistiques", Icone: IconeStatistiques }] },
  {
    titre: "Données",
    liens: [
      { href: "/import", libelle: "Import", Icone: IconeImport },
      { href: "/reglages", libelle: "Réglages", Icone: IconeReglages },
    ],
  },
];

export const TITRES: Record<string, string> = {
  "/": "Prospects",
  "/inbox": "Inbox",
  "/file": "File d'attente",
  "/statistiques": "Statistiques",
  "/import": "Import",
  "/reglages": "Réglages",
};

export function titreDe(chemin: string) {
  const racine = "/" + (chemin.split("/")[1] ?? "");
  return TITRES[racine] ?? "Prospection";
}

/** Navigation de la barre latérale (sales-crm : sections, élément actif en relief, compteurs). */
export function Navigation({ comptes }: { comptes: Comptes }) {
  const chemin = usePathname();
  const estActif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <nav aria-label="Navigation principale">
      {SECTIONS.map((section, i) => (
        <div key={i} className="flex flex-col gap-1 border-b border-trait p-3 last:border-b-0">
          {section.titre && <span className="eyebrow block px-2 pb-1 pt-0.5 text-[#5a5a5a]">{section.titre}</span>}
          <ul className="flex flex-col gap-px">
            {section.liens.map(({ href, libelle, Icone, compte }) => {
              const actif = estActif(href);
              const n = compte ? comptes[compte] : 0;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={actif ? "page" : undefined}
                    data-actif={actif}
                    className="group flex h-[30px] items-center gap-1.5 rounded-lg px-2 text-[14px] leading-none text-encre-3 outline-none transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-sortie)] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent/60 data-[actif=true]:h-8 data-[actif=true]:bg-muet data-[actif=true]:text-encre data-[actif=true]:shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  >
                    <Icone taille={15} className="shrink-0 text-pale transition-colors duration-150 group-hover:text-icone group-data-[actif=true]:text-icone" />
                    <span className="min-w-0 flex-1 truncate">{libelle}</span>
                    {n > 0 && (
                      <span className={`compte ${compte === "nonLus" ? "border-accent/40 bg-accent-doux text-[#febfc6]" : ""}`}>{n}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
