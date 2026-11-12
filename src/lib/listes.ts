/**
 * Informations propres à chaque liste d'origine. Une liste déclare ici ses propriétés ;
 * elles sont stockées dans `prospects.details` et affichées seulement pour les prospects
 * de cette liste. Ajouter une liste = une entrée ici (et l'import qui remplit les clés).
 *
 * Donnée importée, donc non fiable : chaque valeur est revalidée à l'affichage
 * (texte borné ; lien en https uniquement).
 */

export type ChampListe = { cle: string; libelle: string; type: "texte" | "lien" };

export const CHAMPS_PAR_LISTE: Readonly<Record<string, readonly ChampListe[]>> = {
  "Page Notion Publique": [
    { cle: "pageNotion", libelle: "Page Notion", type: "lien" },
    { cle: "requete", libelle: "Requête", type: "texte" },
    { cle: "usageNotion", libelle: "Usage Notion", type: "texte" },
  ],
  // Relations LinkedIn qualifiées dans la base Notion « Réseau 1ᵉʳ degré ».
  "Réseau 1ᵉʳ degré": [
    { cle: "typeCible", libelle: "Type de cible", type: "texte" },
    { cle: "dateConnexion", libelle: "En relation depuis", type: "texte" },
  ],
};

export const LONGUEUR_MAX_DETAIL = 1000;

export function champsDeListe(liste: string | null | undefined): readonly ChampListe[] {
  return (liste && Object.hasOwn(CHAMPS_PAR_LISTE, liste) ? CHAMPS_PAR_LISTE[liste] : undefined) ?? [];
}

/** Lien https sûr (sinon null) : aucun autre schéma (javascript:, data:…) n'est rendu. */
export function lienSur(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur.length > LONGUEUR_MAX_DETAIL) return null;
  try {
    const u = new URL(valeur.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/** Ne garde que les champs déclarés par la liste, avec une valeur valide. */
export function detailsAffichables(
  liste: string | null | undefined,
  details: unknown,
): { cle: string; libelle: string; type: ChampListe["type"]; valeur: string }[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const d = details as Record<string, unknown>;
  const sortie = [];
  for (const champ of champsDeListe(liste)) {
    const brut = Object.hasOwn(d, champ.cle) ? d[champ.cle] : undefined;
    const valeur =
      champ.type === "lien"
        ? lienSur(brut)
        : typeof brut === "string" && brut.trim()
          ? brut.trim().slice(0, LONGUEUR_MAX_DETAIL)
          : null;
    if (valeur) sortie.push({ ...champ, valeur });
  }
  return sortie;
}
