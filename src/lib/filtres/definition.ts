/**
 * Standard des listes filtrées de l'outil.
 *
 * Un filtre = une définition : clé, libellé, type d'interface, et règle de correspondance
 * locale. La même liste de définitions sert :
 *   - au navigateur, pour filtrer instantanément les lignes déjà affichées (`appliquerLocalement`) ;
 *   - au serveur, via le schéma Zod de la liste, pour la requête exacte sur toute la base.
 * Une valeur est une chaîne (texte, choix, date) ou une liste (ex. les conditions du panneau
 * « Filtres » des prospects) ; vide = filtre inactif.
 * Ajouter un filtre : une entrée dans la liste de définitions, le champ dans le schéma Zod, la
 * clause SQL dans la requête serveur, et un cas dans le test de cohérence local / serveur.
 */

export type TypeFiltre = "texte" | "choix" | "date";

export interface DefinitionFiltre<L, F> {
  cle: keyof F & string;
  libelle: string;
  type: TypeFiltre;
  /**
   * La ligne passe-t-elle ce filtre, pour une valeur non vide (chaîne sans les espaces autour, ou
   * liste) ? Même règle que le SQL. Chaque définition type sa propre valeur.
   */
  correspond: (ligne: L, valeur: never) => boolean;
}

/** Une valeur active : chaîne non vide (espaces exclus) ou liste non vide. */
export function valeurActive(v: unknown): boolean {
  return (typeof v === "string" && v.trim() !== "") || (Array.isArray(v) && v.length > 0);
}

/** Valeurs non vides uniquement (une valeur vide = filtre inactif). */
export function filtresActifs<F extends Record<string, unknown>>(filtres: F, cles: readonly (keyof F)[]) {
  return cles.filter((c) => valeurActive(filtres[c]));
}

export function appliquerLocalement<L, F extends Record<string, unknown>>(
  lignes: L[],
  filtres: F,
  definitions: readonly DefinitionFiltre<L, F>[],
): L[] {
  const actifs = definitions.filter((d) => valeurActive(filtres[d.cle]));
  if (actifs.length === 0) return lignes;
  const valeur = (d: DefinitionFiltre<L, F>) => {
    const v = filtres[d.cle];
    return (typeof v === "string" ? v.trim() : v) as never;
  };
  return lignes.filter((l) => actifs.every((d) => d.correspond(l, valeur(d))));
}
