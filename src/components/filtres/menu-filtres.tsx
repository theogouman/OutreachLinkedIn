"use client";
/*
 * Menu de filtres à cases, ouvert par la transition Transitions.dev « Dropdown menu morph »
 * (classes .t-morph* dans globals.css) : le bouton rond se transforme en panneau.
 * Réutilisable par toute liste du standard src/lib/filtres : on lui passe les cases et
 * l'état, il appelle `changer(cle, "oui" | "")`. L'icône passe au rouge dès qu'un filtre est coché.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from "react";

type Icone = ComponentType<SVGProps<SVGSVGElement> & { taille?: number }>;

export function MenuFiltres<C extends string>({
  cases,
  valeurs,
  changer,
  reinitialiser,
  Icone,
  libelle = "Filtres",
}: {
  cases: readonly { cle: C; libelle: string }[];
  valeurs: Partial<Record<C, string | undefined>>;
  changer: (cle: C, valeur: string) => void;
  reinitialiser: () => void;
  Icone: Icone;
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const [taille, setTaille] = useState({ l: 220, h: 180 });
  const menuId = useId();
  const actifs = cases.filter((c) => valeurs[c.cle] === "oui").length;

  // Taille ouverte = taille réelle du menu (la transition anime largeur et hauteur).
  useLayoutEffect(() => {
    const m = menu.current;
    if (m) setTaille({ l: m.scrollWidth, h: m.scrollHeight });
  }, [cases.length]);

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
    // Focus sur la première case une fois le panneau ouvert.
    const id = window.setTimeout(() => menu.current?.querySelector<HTMLInputElement>("input")?.focus(), 120);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
      window.clearTimeout(id);
    };
  }, [ouvert]);

  return (
    // Emplacement à la taille du bouton fermé : le panneau ouvert passe par-dessus la liste.
    <div className="relative size-10 shrink-0">
      <div
        ref={racine}
        className={`t-morph absolute left-0 top-0 z-30 ${ouvert ? "bg-carte shadow-[0_16px_40px_-8px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)]" : "bg-carte shadow-[0_0_0_1px_var(--color-trait)]"}`}
        data-open={ouvert ? "true" : "false"}
        style={{ ["--morph-w" as string]: `${taille.l}px`, ["--morph-h" as string]: `${taille.h}px` }}
      >
        <div ref={menu} id={menuId} className="t-morph-menu w-max min-w-[220px] p-2" role="group" aria-label={libelle} inert={!ouvert}>
          <div className="flex items-center justify-between gap-4 px-2 pb-1 pt-1.5">
            <span className="caption-4 text-encre-3">{libelle}</span>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="grid size-6 place-items-center rounded-full text-encre-3 outline-none hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Fermer les filtres"
            >
              <svg viewBox="0 0 256 256" className="size-3" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" aria-hidden>
                <path d="M200 56 56 200M200 200 56 56" />
              </svg>
            </button>
          </div>
          <ul className="flex flex-col">
            {cases.map((c) => {
              const coche = valeurs[c.cle] === "oui";
              return (
                <li key={c.cle}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 body-6 text-encre transition-colors duration-150 hover:bg-creux has-[:focus-visible]:bg-creux">
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={(e) => changer(c.cle, e.target.checked ? "oui" : "")}
                      className="size-4 accent-[var(--color-action)]"
                    />
                    {c.libelle}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-trait px-2 pt-2">
            <button
              type="button"
              disabled={actifs === 0}
              onClick={() => {
                reinitialiser();
                setOuvert(false);
                bouton.current?.focus();
              }}
              className="caption-3 text-action outline-none hover:underline focus-visible:underline disabled:text-encre-3 disabled:no-underline"
            >
              Tout afficher
            </button>
          </div>
        </div>
        <button
          ref={bouton}
          type="button"
          className="t-morph-plus outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          aria-expanded={ouvert}
          aria-controls={menuId}
          aria-label={actifs > 0 ? `${libelle} (${actifs} actif${actifs > 1 ? "s" : ""})` : libelle}
          onClick={(e) => {
            e.stopPropagation();
            setOuvert((v) => !v);
          }}
        >
          <Icone taille={20} className={actifs > 0 ? "text-action" : "text-encre-2"} />
        </button>
      </div>
    </div>
  );
}
