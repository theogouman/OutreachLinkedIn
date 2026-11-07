// Génère les icônes de l'app (public/icons) : « P » blanc et point brand sur fond sombre.
// Rendu par Chromium via Playwright (préinstallé dans l'environnement, pas une dépendance).
// Usage : node scripts/generer-icones-pwa.mjs
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const SORTIE = join(dirname(fileURLToPath(import.meta.url)), "..", "public/icons");

// échelle : part du carré occupée par le motif (0,8 = zone sûre des icônes « maskable »)
const ICONES = [
  { nom: "apple-touch-icon.png", taille: 180, echelle: 1 },
  { nom: "icon-192.png", taille: 192, echelle: 1 },
  { nom: "icon-512.png", taille: 512, echelle: 1 },
  { nom: "icon-512-maskable.png", taille: 512, echelle: 0.8 },
];

const page = (taille, echelle) => `<!doctype html><html><body style="margin:0">
<div style="width:${taille}px;height:${taille}px;background:#1a1a1a;display:grid;place-items:center">
  <div style="display:flex;align-items:baseline;gap:${0.035 * taille * echelle}px;transform:translateX(${0.04 * taille * echelle}px)">
    <span style="font:700 ${0.62 * taille * echelle}px/1 -apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;color:#fff;letter-spacing:-0.04em">P</span>
    <span style="width:${0.12 * taille * echelle}px;height:${0.12 * taille * echelle}px;border-radius:50%;background:#e0625a"></span>
  </div>
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
