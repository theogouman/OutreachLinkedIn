"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef } from "react";
import { IconePageFile, IconePageImport, IconePageInbox, IconePageProspects, IconePageReglages, IconePageStats } from "./icones-pages";

const LIENS = [
  { href: "/", libelle: "Prospects", Icone: IconePageProspects, compte: null },
  { href: "/inbox", libelle: "Inbox", Icone: IconePageInbox, compte: "nonLus" },
  { href: "/file", libelle: "File", Icone: IconePageFile, compte: "enAttente" },
  { href: "/statistiques", libelle: "Stats", Icone: IconePageStats, compte: null },
  { href: "/import", libelle: "Import", Icone: IconePageImport, compte: null },
  { href: "/reglages", libelle: "Réglages", Icone: IconePageReglages, compte: null },
] as const;


type Comptes = { nonLus: number; enAttente: number };

/**
 * Navigation principale (DA Notion Club) : pilule glissante sous l'onglet actif.
 * « haut » : barre flottante desktop ; « bas » : barre de pouce mobile.
 *
 * La pilule est un seul élément, placé d'après la position de l'onglet DANS la barre
 * (offsetLeft / offsetWidth) et déplacé en transform. Pas d'animation partagée (layoutId) :
 * mesurée en coordonnées de page, elle partait de la position de défilement quand Next remet
 * la page en haut, et la pilule remontait depuis le bas de l'écran.
 */
export function Navigation({ comptes, variante }: { comptes: Comptes; variante: "haut" | "bas" }) {
  const chemin = usePathname();
  const estActif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const bas = variante === "bas";
  const liste = useRef<HTMLUListElement>(null);
  const pilule = useRef<HTMLSpanElement>(null);
  const placee = useRef(false);

  const placer = useCallback((animer: boolean) => {
    const p = pilule.current;
    // L'élément de liste de l'onglet actif : ses offsets sont relatifs à la liste (relative).
    const actif = liste.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.closest("li");
    if (!p) return;
    if (!actif) {
      p.style.opacity = "0";
      return;
    }
    // Sans animation au premier placement et au redimensionnement : la pilule y est déjà.
    p.style.transition = animer && placee.current ? "" : "none";
    p.style.opacity = "1";
    p.style.width = `${actif.offsetWidth}px`;
    p.style.height = `${actif.offsetHeight}px`;
    p.style.transform = `translate(${actif.offsetLeft}px, ${actif.offsetTop}px)`;
    if (!animer || !placee.current) void p.offsetWidth; // applique la position avant de rétablir la transition
    placee.current = true;
  }, []);

  useLayoutEffect(() => {
    placer(true);
  }, [chemin, comptes.nonLus, comptes.enAttente, placer]);

  useLayoutEffect(() => {
    const ul = liste.current;
    if (!ul) return;
    const obs = new ResizeObserver(() => placer(false));
    obs.observe(ul);
    return () => obs.disconnect();
  }, [placer]);

  return (
    <nav aria-label="Navigation principale">
      <ul ref={liste} className={`relative ${bas ? "flex items-stretch justify-between gap-1" : "flex items-center gap-0.5"}`}>
        <span
          ref={pilule}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-full bg-black/[0.07] opacity-0 transition-[transform,width,height] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        />
        {LIENS.map(({ href, libelle, Icone, compte }) => {
          const actif = estActif(href);
          const n = compte ? comptes[compte] : 0;
          return (
            <li key={href} className={`relative ${bas ? "flex-1" : ""}`}>
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                aria-label={n > 0 ? `${libelle} (${n})` : undefined}
                className={`relative flex items-center rounded-full whitespace-nowrap outline-none transition-colors duration-150 focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] ${
                  bas ? "flex-col gap-0.5 px-2 py-1.5 text-[11px]" : "gap-2 px-4 py-2 text-sm"
                } font-medium ${actif ? "text-encre" : "text-encre-2 hover:bg-black/[0.04] hover:text-encre"}`}
              >
                <span className="relative">
                  <Icone taille={bas ? 20 : 17} />
                  {n > 0 && bas && (
                    <span className={`absolute -right-2 -top-1 min-w-4 rounded-full px-1 text-center text-[11px] font-medium leading-4 tabular-nums ${compte === "nonLus" ? "bg-action text-white" : "bg-sombre text-white"}`}>
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
