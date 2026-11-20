"use client";

/*
 * Panneau « Filtres » de la liste Prospects : composant Filters de ReUI (motif c-filters-10, mode
 * « advanced » en popover), toutes les conditions en ET (groupes désactivés). Champs : Relation,
 * Étape, Liste (est l'un de / n'est aucun de) et Date › relance prévue, entrée en relation, dernier
 * message (période, éditeur EditeurPeriode d'après c-calendar-16). Les règles finies sont converties
 * en conditions validées (src/lib/filtres/requete-prospects.ts) et envoyées à la liste.
 * Bouton en rouge pastel (accent-doux) avec le nombre de filtres dès qu'un filtre est actif.
 */

import { useMemo, useState } from "react";
import { Filters } from "@/components/reui/filters/filters";
import type { FilterField, FilterOperator, FilterQuery } from "@/components/reui/filters/filters-types";
import { Button } from "@/components/ui/button";
import { IconeFiltreDate, IconeFiltreEtape, IconeFiltreListe, IconeFiltreRelation, IconeFiltresListe } from "@/components/icones-pages";
import { LIBELLES_STATUT } from "@/lib/statut-relation";
import type { Condition } from "@/lib/filtres/prospects";
import {
  CHAMP_DATES,
  conditionsDepuisRequete,
  OP_EST,
  OP_NEST_PAS,
  OP_PERIODE,
  requeteDepuisConditions,
  type GroupeFiltre,
  type Periode,
} from "@/lib/filtres/requete-prospects";
import { EditeurPeriode, textePeriode } from "./editeur-periode";
import { LIBELLES_FILTRES, OPERATEURS_FILTRES } from "./libelles-filtres";

const CHOIX: FilterOperator[] = [
  { value: OP_EST, label: OPERATEURS_FILTRES.is_any_of!, arity: "many", inverse: OP_NEST_PAS },
  { value: OP_NEST_PAS, label: OPERATEURS_FILTRES.is_none_of!, arity: "many", inverse: OP_EST },
];
const PERIODE: FilterOperator[] = [{ value: OP_PERIODE, label: OPERATEURS_FILTRES.periode!, arity: "one" }];

const icone = (I: typeof IconeFiltreDate) => <I taille={16} />;

export function FiltresProspects({
  initiales,
  etapes,
  listes,
  changer,
}: {
  initiales?: Condition[];
  etapes: { code: string; libelle: string }[];
  listes: string[];
  /** Conditions finies et validées, à chaque changement. */
  changer: (conditions: Condition[]) => void;
}) {
  const [requete, setRequete] = useState<FilterQuery>(() => requeteDepuisConditions(initiales) as FilterQuery);
  const nombre = useMemo(() => conditionsDepuisRequete(requete as GroupeFiltre).length, [requete]);

  const champs = useMemo<FilterField[]>(
    () => [
      {
        id: "statut",
        label: "Relation",
        icon: icone(IconeFiltreRelation),
        type: "select",
        operators: CHOIX,
        defaultOperator: OP_EST,
        options: Object.entries(LIBELLES_STATUT).map(([value, label]) => ({ value, label })),
      },
      {
        id: "etape",
        label: "Étape",
        icon: icone(IconeFiltreEtape),
        type: "select",
        operators: CHOIX,
        defaultOperator: OP_EST,
        searchable: true,
        options: etapes.map((e) => ({ value: e.code, label: e.libelle })),
      },
      {
        id: "liste",
        label: "Liste",
        icon: icone(IconeFiltreListe),
        type: "select",
        operators: CHOIX,
        defaultOperator: OP_EST,
        searchable: true,
        options: listes.map((x) => ({ value: x, label: x })),
      },
      {
        id: CHAMP_DATES,
        label: "Date",
        icon: icone(IconeFiltreDate),
        selectable: false,
        fields: [
          { id: "relance", label: "Relance prévue" },
          { id: "relation", label: "Entrée en relation" },
          { id: "message", label: "Dernier message" },
        ].map((f) => ({
          ...f,
          icon: icone(IconeFiltreDate),
          operators: PERIODE,
          defaultOperator: OP_PERIODE,
          editor: EditeurPeriode,
          valueText: ({ value }: { value: unknown }) => textePeriode(value as Periode),
          renderValue: ({ value }: { value: unknown }) => textePeriode(value as Periode),
        })),
      },
    ],
    [etapes, listes],
  );

  return (
    <Filters
      variant="advanced"
      advancedMode="popover"
      advancedAlign="start"
      groups={false}
      fields={champs}
      labels={LIBELLES_FILTRES}
      operatorLabels={OPERATEURS_FILTRES}
      // Panneau plus large que le défaut de ReUI (42rem) : « Date › Dernier message » tient en entier ;
      // sur téléphone, chaque condition sur deux lignes (champ, puis opérateur et valeur).
      className="w-[46rem] [--filter-field-width:15rem] [--filter-operator-width:7.5rem] [--filter-value-width:14rem] max-sm:[--filter-operator-width:5.5rem] max-sm:[--filter-value-width:10rem]"
      query={requete}
      onQueryChange={(q) => {
        setRequete(q);
        changer(conditionsDepuisRequete(q as GroupeFiltre));
      }}
      trigger={
        <Button
          variant="outline"
          className={`h-10 gap-2 rounded-full px-4 font-normal ${nombre > 0 ? "border-accent/30 bg-accent-doux text-rouge hover:bg-accent-doux hover:text-rouge" : ""}`}
          aria-label={nombre > 0 ? `Filtres, ${LIBELLES_FILTRES.countAnnouncement(nombre)}` : "Filtres"}
        >
          <IconeFiltresListe taille={16} />
          Filtres
          {nombre > 0 && <span className="rounded-full bg-accent/15 px-1.5 text-xs tabular-nums">{nombre}</span>}
        </Button>
      }
    />
  );
}
