/**
 * Normalise une URL de profil LinkedIn pour rapprocher les sources (CSV d'archive,
 * export Notion, synchronisations Unipile). Forme normalisée : "linkedin.com/in/<id>".
 * Toute entrée non reconnue renvoie null (jamais d'exception sur donnée externe).
 */

export interface ProfilLinkedIn {
  urlNormalisee: string;
  publicIdentifier: string;
}

const HOTE = /^([a-z]{2,3}\.|www\.|m\.)?linkedin\.com$/;
// Lettres (y compris accentuées), chiffres, tirets, soulignés. 3 à 100 caractères.
const IDENTIFIANT = /^[\p{L}\p{N}_-]{3,100}$/u;

export function normaliserUrlLinkedIn(entree: unknown): ProfilLinkedIn | null {
  if (typeof entree !== "string") return null;
  const brut = entree.trim();
  if (!brut || brut.length > 500) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(brut) ? brut : `https://${brut}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOTE.test(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0]?.toLowerCase() !== "in") return null;

  let id: string;
  try {
    id = decodeURIComponent(segments[1] ?? "");
  } catch {
    return null;
  }
  id = id.normalize("NFC").toLowerCase();
  if (!IDENTIFIANT.test(id)) return null;

  return identifiantVersProfil(id);
}

/** Construit la forme normalisée depuis un identifiant public (ex. renvoyé par Unipile). */
export function identifiantVersProfil(publicIdentifier: string): ProfilLinkedIn | null {
  const id = publicIdentifier.trim().normalize("NFC").toLowerCase();
  if (!IDENTIFIANT.test(id)) return null;
  return { urlNormalisee: `linkedin.com/in/${id}`, publicIdentifier: id };
}

/**
 * Lien cliquable vers un profil : reconstruit depuis l'identifiant validé, jamais repris tel quel
 * (aucun autre domaine ni schéma possible). null si l'entrée n'est pas un profil LinkedIn.
 */
export function lienProfilLinkedIn(entree: unknown): string | null {
  const profil = normaliserUrlLinkedIn(entree);
  return profil ? `https://www.linkedin.com/in/${encodeURIComponent(profil.publicIdentifier)}/` : null;
}
