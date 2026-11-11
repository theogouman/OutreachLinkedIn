// Routes accessibles sans session. Le worker et les webhooks ont leur propre
// authentification (secret, signature) vérifiée dans la route elle-même. Le manifest
// et le service worker ne contiennent aucune donnée : iOS les lit avant toute connexion.
const ROUTES_PUBLIQUES = [
  /^\/login$/,
  /^\/auth\/callback$/,
  /^\/api\/worker\//,
  /^\/api\/webhooks\//,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
];

export function estRoutePublique(chemin: string): boolean {
  return ROUTES_PUBLIQUES.some((r) => r.test(chemin));
}
