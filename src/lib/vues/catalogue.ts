import { z } from "zod";
import { clePropriete, type ClePropriete } from "@/lib/proprietes/prospects";

/*
 * Catalogue des mises en page (kit de vues). Chaque type d'affichage déclare ses réglages
 * (schéma Zod) et leurs valeurs par défaut ; son rendu vit dans src/components/vues/.
 * Une vue enregistrée (table `vues`) = un type de ce catalogue + ses réglages. Ajouter un type
 * (calendrier…) : une entrée ici, une icône (ICONES_VUE, barre-vues.tsx), un rendu dans
 * src/components/vues/ branché dans liste-prospects.tsx, et la valeur dans la contrainte SQL
 * `vues_type_check` (migration).
 */

export const TYPES_VUE = ["table", "galerie", "kanban"] as const;
export type TypeVue = (typeof TYPES_VUE)[number];
export const typeVue = z.enum(TYPES_VUE);

const proprietesVisibles = z
  .array(clePropriete)
  .max(12)
  .transform((l) => [...new Set(l)]);

export const OPTIONS_VUE = {
  table: z.object({ proprietes: proprietesVisibles }),
  galerie: z.object({ proprietes: proprietesVisibles }),
  kanban: z.object({ proprietes: proprietesVisibles }),
} satisfies Record<TypeVue, z.ZodType>;

export type OptionsVue = { proprietes: ClePropriete[] };

export const MISES_EN_PAGE: Record<
  TypeVue,
  {
    libelle: string;
    description: string;
    defaut: OptionsVue;
    /** Propriétés que la mise en page affiche déjà autrement (absentes du choix « Propriétés affichées »). */
    sansProprietes?: ClePropriete[];
  }
> = {
  table: {
    libelle: "Table",
    description: "Une ligne par prospect, une colonne par propriété, triable",
    defaut: { proprietes: ["entreprise", "relation", "etape", "relance", "liste"] },
  },
  galerie: {
    libelle: "Galerie",
    description: "Une carte compacte par prospect, propriétés modifiables sur place",
    defaut: { proprietes: ["entreprise", "relation", "etape", "liste"] },
  },
  kanban: {
    libelle: "Kanban",
    description: "Une colonne par étape ; glisser une carte change son étape",
    defaut: { proprietes: ["entreprise", "relation", "relance"] },
    // L'étape fait les colonnes.
    sansProprietes: ["etape"],
  },
};

/** Réglages lus en base : revalidés, sinon remplacés par ceux par défaut (jamais d'erreur à l'affichage). */
export function optionsAffichables(type: TypeVue, brut: unknown): OptionsVue {
  const r = OPTIONS_VUE[type].safeParse(brut);
  return r.success ? r.data : MISES_EN_PAGE[type].defaut;
}

export interface Vue {
  id: string;
  nom: string;
  type: TypeVue;
  options: OptionsVue;
}
