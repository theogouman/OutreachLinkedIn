"use client";

/*
 * Standard des listes filtrées (voir src/lib/filtres/definition.ts).
 *
 * Les filtres vivent dans l'état du composant, jamais dans l'URL. À chaque changement :
 *   1. la liste affichée est filtrée tout de suite avec les règles locales (aucune attente) ;
 *   2. l'action serveur est appelée (immédiatement pour un choix ou une date, 200 ms après la
 *      dernière frappe pour un texte) et sa réponse remplace la liste, exacte sur toute la base ;
 *   3. une réponse arrivée après une demande plus récente est ignorée.
 * Changer un filtre ramène à la page 1. Si le serveur rafraîchit la page (import, démo…), la
 * liste est rechargée avec les filtres en cours.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { appliquerLocalement, type DefinitionFiltre } from "@/lib/filtres/definition";

const DELAI_TEXTE_MS = 200;

type Reponse<L> = { ok: true; lignes: L[]; total: number } | { ok: false; message: string };

export function useListeFiltree<L, F extends { page: number }>({
  initial,
  filtresInitiaux,
  definitions,
  charger,
}: {
  initial: { lignes: L[]; total: number };
  filtresInitiaux: F;
  definitions: readonly DefinitionFiltre<L, F>[];
  charger: (filtres: F) => Promise<Reponse<L>>;
}) {
  const [filtres, setFiltresEtat] = useState<F>(filtresInitiaux);
  const courant = useRef(filtresInitiaux);
  const setFiltres = useCallback((f: F) => {
    courant.current = f;
    setFiltresEtat(f);
  }, []);
  const [resultat, setResultat] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const numero = useRef(0);
  const minuteur = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const lancer = useCallback(
    (f: F, delai: number) => {
      window.clearTimeout(minuteur.current);
      const n = ++numero.current;
      const envoyer = () =>
        demarrer(async () => {
          const r = await charger(f);
          if (n !== numero.current) return; // une demande plus récente est partie
          if (r.ok) {
            setResultat({ lignes: r.lignes, total: r.total });
            setErreur(null);
          } else setErreur(r.message);
        });
      if (delai > 0) minuteur.current = window.setTimeout(envoyer, delai);
      else envoyer();
    },
    [charger],
  );

  // Les données de départ changent quand le serveur rafraîchit la page (import, démo, action) :
  // on recharge avec les filtres en cours pour ne pas afficher une liste périmée.
  // Comparées par contenu (total et identifiants), pas par identité d'objet.
  const signature = `${initial.total}:${initial.lignes.map((x) => (x as { id?: string }).id ?? "").join(",")}`;
  const signatureVue = useRef(signature);
  useEffect(() => {
    if (signature === signatureVue.current) return;
    signatureVue.current = signature;
    lancer(courant.current, 0);
  }, [signature, lancer]);

  /** Change un filtre ; une chaîne vide le désactive. */
  const changer = useCallback(
    (cle: keyof F & string, valeur: string) => {
      const def = definitions.find((d) => d.cle === cle);
      const suivant = { ...courant.current, [cle]: valeur || undefined, page: 1 } as F;
      setFiltres(suivant);
      lancer(suivant, def?.type === "texte" && valeur.trim() ? DELAI_TEXTE_MS : 0);
    },
    [definitions, lancer, setFiltres],
  );

  const allerPage = useCallback(
    (page: number) => {
      const suivant = { ...courant.current, page };
      setFiltres(suivant);
      lancer(suivant, 0);
    },
    [lancer, setFiltres],
  );

  const reinitialiser = useCallback(() => {
    setFiltres(filtresInitiaux);
    lancer(filtresInitiaux, 0);
  }, [filtresInitiaux, lancer, setFiltres]);

  // Affichage instantané : la dernière réponse, filtrée par les règles locales en attendant la suivante.
  const lignes = useMemo(() => appliquerLocalement(resultat.lignes, filtres, definitions), [resultat.lignes, filtres, definitions]);
  const actifs = definitions.filter((d) => {
    const v = filtres[d.cle];
    return typeof v === "string" && v.trim() !== "";
  }).length;

  // Tant que la réponse n'est pas arrivée, le total suit le filtrage instantané.
  const total = lignes.length === resultat.lignes.length ? resultat.total : lignes.length;

  return { filtres, changer, allerPage, reinitialiser, lignes, total, enCours, erreur, actifs };
}
