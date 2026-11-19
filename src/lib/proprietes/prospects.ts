import { z } from "zod";

/*
 * Catalogue des propriétés d'un prospect : chaque propriété est décrite une seule fois (type,
 * libellé, modifiable ou non) et sert à toutes les mises en page (colonne de table, ligne de
 * carte de galerie…). Ajouter une propriété ici la rend disponible dans toutes les vues.
 * `modifiable` : modification sur place dans les vues, validée côté serveur
 * (src/server/mutations.ts, `modifierPropriete`). Le statut de relation reste en lecture seule :
 * il découle de LinkedIn. L'étape suit les faits (src/server/etapes.ts).
 */

export type TypePropriete = "texte" | "statut" | "etape" | "date" | "liste";

export const CLES_PROPRIETES = ["entreprise", "poste", "relation", "etape", "relance", "liste"] as const;
export type ClePropriete = (typeof CLES_PROPRIETES)[number];
export const clePropriete = z.enum(CLES_PROPRIETES);

export interface DefinitionPropriete {
  cle: ClePropriete;
  libelle: string;
  type: TypePropriete;
  modifiable: boolean;
}

export const PROPRIETES_PROSPECTS: Record<ClePropriete, DefinitionPropriete> = {
  entreprise: { cle: "entreprise", libelle: "Entreprise", type: "texte", modifiable: false },
  poste: { cle: "poste", libelle: "Poste", type: "texte", modifiable: false },
  relation: { cle: "relation", libelle: "Relation", type: "statut", modifiable: false },
  etape: { cle: "etape", libelle: "Étape", type: "etape", modifiable: false },
  relance: { cle: "relance", libelle: "Prochaine relance", type: "date", modifiable: false },
  liste: { cle: "liste", libelle: "Liste d'origine", type: "liste", modifiable: true },
};

/** Liste d'origine : texte libre borné (l'appartenance aux listes existantes est vérifiée en base). */
export const valeurListe = z
  .string()
  .max(100)
  .transform((t) => t.trim() || null)
  .nullable();
