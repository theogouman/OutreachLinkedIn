/**
 * Règle de recherche des prospects, partagée par le filtrage instantané (navigateur) et la
 * requête serveur (même normalisation, appliquée en SQL par `prospectsDepuis`) :
 * chaque mot saisi doit apparaître dans prénom, nom, entreprise ou poste, sans casse ni accents.
 */

export const MAX_TERMES = 8;

/** Sans accents ni casse (« Société » → « societe »). */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function termesRecherche(saisie: string): string[] {
  return normaliser(saisie).split(/\s+/).filter(Boolean).slice(0, MAX_TERMES);
}

type Cherchable = { prenom: string | null; nom: string | null; entreprise: string | null; poste: string | null };

export function correspond(p: Cherchable, saisie: string): boolean {
  const termes = termesRecherche(saisie);
  if (termes.length === 0) return true;
  const texte = normaliser([p.prenom, p.nom, p.entreprise, p.poste].filter(Boolean).join(" "));
  return termes.every((t) => texte.includes(t));
}

/*
 * Équivalent SQL de `normaliser` : lower() puis translate() des lettres accentuées que la
 * décomposition NFD ramène à une lettre de base (table construite ici, une seule source).
 */
const ACCENTUEES = "àáâãäåāăąçćĉċčďèéêëēĕėęěĝğġģĥìíîïĩīĭįĵķĺļľñńņňòóôõöōŏőŕŗřśŝşšţťùúûüũūŭůűųŵýÿŷźżž";
export const TRANSLATE_DE = ACCENTUEES;
export const TRANSLATE_VERS = Array.from(ACCENTUEES, (c) => normaliser(c)).join("");
