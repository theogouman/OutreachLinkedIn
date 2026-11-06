/**
 * Chemin de retour après connexion. N'accepte qu'un chemin interne ("/crm"),
 * jamais une URL absolue ni "//domaine" (redirection ouverte).
 */
export function cheminDeRetourSur(valeur: string | null | undefined, defaut = "/"): string {
  if (!valeur || valeur.length > 200) return defaut;
  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.startsWith("/\\")) return defaut;
  if (/[\u0000-\u001f\\]/.test(valeur)) return defaut;
  try {
    const url = new URL(valeur, "https://interne.invalid");
    if (url.origin !== "https://interne.invalid") return defaut;
    return `${url.pathname}${url.search}`;
  } catch {
    return defaut;
  }
}
