"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconeFermer, IconeRecherche } from "@/components/icones";

/*
 * Recherche en temps réel des prospects, en deux temps :
 * 1. à chaque caractère, la liste affichée est filtrée tout de suite dans le navigateur
 *    (même règle que le serveur : src/lib/recherche.ts) ;
 * 2. 200 ms après la dernière frappe, l'URL (?q=) est mise à jour dans une transition : le serveur
 *    renvoie le résultat exact sur toute la base, sans écran de chargement.
 * Vider le champ retire le filtre immédiatement.
 */

const DELAI_MS = 200;

type Recherche = { saisie: string; enCours: boolean; changer: (v: string) => void };

const Contexte = createContext<Recherche | null>(null);

/** Saisie en cours, ou chaîne vide hors du fournisseur (aucun filtrage). */
export function useSaisieRecherche() {
  return useContext(Contexte)?.saisie ?? "";
}

export function FournisseurRecherche({ initiale, children }: { initiale: string; children: ReactNode }) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [saisie, setSaisie] = useState(initiale);
  const [initialePrecedente, setInitialePrecedente] = useState(initiale);
  const [enCours, demarrer] = useTransition();
  const minuteur = useRef<number | undefined>(undefined);
  const [envoyee, setEnvoyee] = useState(initiale);

  // L'URL a changé sans passer par le champ (Réinitialiser, retour arrière) : on la suit.
  if (initiale !== initialePrecedente) {
    setInitialePrecedente(initiale);
    if (initiale !== envoyee) {
      setSaisie(initiale);
      setEnvoyee(initiale);
    }
  }

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const appliquer = useCallback(
    (valeur: string) => {
      const q = new URLSearchParams(params);
      const propre = valeur.trim();
      if (propre) q.set("q", propre);
      else q.delete("q");
      q.delete("page");
      setEnvoyee(propre);
      demarrer(() => router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false }));
    },
    [params, chemin, router],
  );

  const changer = useCallback(
    (valeur: string) => {
      setSaisie(valeur);
      window.clearTimeout(minuteur.current);
      if (!valeur.trim()) appliquer("");
      else minuteur.current = window.setTimeout(() => appliquer(valeur), DELAI_MS);
    },
    [appliquer],
  );

  return <Contexte value={{ saisie, enCours, changer }}>{children}</Contexte>;
}

export function ChampRecherche() {
  const r = useContext(Contexte);
  if (!r) return null;
  return (
    <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
      <span className="sr-only">Rechercher un prospect</span>
      <IconeRecherche taille={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-3" />
      <input
        type="search"
        value={r.saisie}
        onChange={(e) => r.changer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && r.saisie) {
            e.preventDefault();
            r.changer("");
          }
          // Entrée n'envoie pas le formulaire des autres filtres : la recherche s'applique seule.
          if (e.key === "Enter") e.preventDefault();
        }}
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        placeholder="Rechercher"
        className="champ pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
        {r.enCours ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-trait border-t-accent" role="status" aria-label="Recherche en cours" />
        ) : (
          r.saisie && (
            <button
              type="button"
              onClick={() => r.changer("")}
              aria-label="Effacer la recherche"
              className="grid size-6 place-items-center rounded-full text-encre-3 outline-none hover:bg-black/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
            >
              <IconeFermer taille={12} />
            </button>
          )
        )}
      </span>
    </label>
  );
}
