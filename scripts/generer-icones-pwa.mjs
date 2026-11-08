// Génère les icônes de l'app (public/icons) : logo-glow.svg sur fond sombre #1a1a1a.
// Rendu par Chromium via Playwright (préinstallé dans l'environnement, pas une dépendance).
// Usage : node scripts/generer-icones-pwa.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "public/icons");
const LOGO = readFileSync(join(RACINE, "public/logo-glow.svg"), "utf8");

// échelle : part du carré occupée par le logo (réduite pour la zone sûre des icônes « maskable »)
const ICONES = [
  { nom: "apple-touch-icon.png", taille: 180, echelle: 0.86 },
  { nom: "icon-192.png", taille: 192, echelle: 0.86 },
  { nom: "icon-512.png", taille: 512, echelle: 0.86 },
  { nom: "icon-512-maskable.png", taille: 512, echelle: 0.66 },
];

const page = (taille, echelle) => `<!doctype html><html><body style="margin:0">
<div style="width:${taille}px;height:${taille}px;background:#1a1a1a;display:grid;place-items:center">
  <div style="width:${taille * echelle}px;height:${taille * echelle}px">${LOGO.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}</div>
</div></body></html>`;

mkdirSync(SORTIE, { recursive: true });
const navigateur = await chromium.launch();
for (const { nom, taille, echelle } of ICONES) {
  const p = await navigateur.newPage({ viewport: { width: taille, height: taille } });
  await p.setContent(page(taille, echelle));
  await p.screenshot({ path: join(SORTIE, nom), omitBackground: false });
  await p.close();
  console.log(nom);
}
await navigateur.close();
