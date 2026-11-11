/**
 * Standard des listes filtrées de l'outil.
 *
 * Un filtre = une définition : clé, libellé, type d'interface, et règle de correspondance
 * locale. La même liste de définitions sert :
 *   - au navigateur, pour filtrer instantanément les lignes déjà affichées (`appliquerLocalement`) ;
 *   - au serveur, via le schéma Zod de la liste, pour la requête exacte sur toute la base.
 * Ajouter un filtre : une entrée dans la liste de définitions, le champ dans le schéma Zod, la
 * clause SQL dans la requête serveur, et un cas dans le test de cohérence local / serveur.
 */

export type TypeFiltre = "texte" | "choix" | "date";

export interface DefinitionFiltre<L, F> {
  cle: keyof F & string;
  libelle: string;
  type: TypeFiltre;
  /** La ligne passe-t-elle ce filtre, pour une valeur non vide ? Même règle que le SQL. */
  correspond: (ligne: L, valeur: string) => boolean;
}

/** Valeurs non vides uniquement (une valeur vide = filtre inactif). */
export function filtresActifs<F extends Record<string, unknown>>(filtres: F, cles: readonly (keyof F)[]) {
  return cles.filter((c) => typeof filtres[c] === "string" && (filtres[c] as string).trim() !== "");
}

export function appliquerLocalement<L, F extends Record<string, unknown>>(
  lignes: L[],
  filtres: F,
  definitions: readonly DefinitionFiltre<L, F>[],
): L[] {
  const actifs = definitions.filter((d) => typeof filtres[d.cle] === "string" && (filtres[d.cle] as string).trim() !== "");
  if (actifs.length === 0) return lignes;
  return lignes.filter((l) => actifs.every((d) => d.correspond(l, (filtres[d.cle] as string).trim())));
}
