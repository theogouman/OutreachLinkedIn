import "server-only";

/**
 * Téléchargement d'une photo de profil LinkedIn (adresse donnée par Unipile : public_picture_url).
 * Donnée externe : hôte LinkedIn uniquement (licdn.com, https, sans redirection), taille bornée,
 * type vérifié par l'en-tête ET par la signature du fichier. Tout écart → pas de photo.
 */

export const TAILLE_MAX_PHOTO = 300 * 1024;
const HOTE = /(^|\.)licdn\.com$/i;

export interface Photo {
  contenu: Buffer;
  type: "image/jpeg" | "image/png" | "image/webp";
}

function typeReel(b: Buffer): Photo["type"] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function telechargerPhoto(adresse: string, f: typeof fetch = fetch): Promise<Photo | null> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOTE.test(url.hostname)) return null;
  let rep: Response;
  try {
    rep = await f(url, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    return null;
  }
  if (!rep.ok) return null;
  if (Number(rep.headers.get("content-length") ?? 0) > TAILLE_MAX_PHOTO) return null;
  const contenu = Buffer.from(await rep.arrayBuffer());
  if (contenu.length === 0 || contenu.length > TAILLE_MAX_PHOTO) return null;
  const type = typeReel(contenu);
  return type ? { contenu, type } : null;
}
