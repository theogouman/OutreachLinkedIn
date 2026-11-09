// Génère src/components/icones-pages.tsx depuis public/icons/*.svg (exports SF Symbols fournis par
// l'utilisateur). Tant qu'un fichier manque, l'icône prend un tracé Phosphor de repli.
// Usage : node scripts/generer-icones-pages.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

// [composant, fichier SF Symbols, repli Phosphor (viewBox 256) ou null]
const ICONES = [
  ["IconePageProspects", "figure.walk.motion", null],
  ["IconePageInbox", "bubble.left.and.text.bubble.right", null],
  ["IconePageFile", "list.bullet.indent", null],
  ["IconePageStats", "chart.line.uptrend.xyaxis", null],
  ["IconePageImport", "square.and.arrow.up", null],
  ["IconePageReglages", "gear", null],
  [
    "IconeFiltresListe",
    "line.3.horizontal.decrease.circle",
    "M200,136a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H192A8,8,0,0,1,200,136Zm32-56H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-80,96H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z",
  ],
  [
    "IconeRechercheTexte",
    "text.magnifyingglass",
    "M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z",
  ],
];

const sortie = [
  `/*
 * Icônes des pages et des listes, fournies par l'utilisateur dans public/icons (export SF Symbols,
 * Apple). Tracés repris tels quels ; remplissage en currentColor, glyphe centré dans un carré.
 * FICHIER GÉNÉRÉ par scripts/generer-icones-pages.mjs : ne pas éditer à la main.
 * Une icône dont le fichier SVG manque utilise un tracé Phosphor de repli (MIT).
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { taille?: number };

function icone(vue: string, traces: string[]) {
  const [, , l, h] = vue.split(" ").map(Number) as [number, number, number, number];
  const cote = Math.max(l, h);
  const boite = \`\${(l - cote) / 2} \${(h - cote) / 2} \${cote} \${cote}\`;
  return function Icone({ taille = 18, ...props }: P) {
    return (
      <svg viewBox={boite} width={taille} height={taille} fill="currentColor" aria-hidden focusable="false" {...props}>
        {traces.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  };
}
`,
];
const manquantes = [];
for (const [composant, fichier, repli] of ICONES) {
  const chemin = join(RACINE, "public/icons", `${fichier}.svg`);
  let vue;
  let traces;
  if (existsSync(chemin)) {
    const s = readFileSync(chemin, "utf8");
    vue = s.match(/viewBox="([^"]+)"/)[1];
    traces = [...s.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  } else if (repli) {
    manquantes.push(fichier);
    vue = "0 0 256 256";
    traces = [repli];
  } else throw new Error(`Icône manquante sans repli : ${fichier}.svg`);
  sortie.push(
    `export const ${composant} = icone("${vue}", [\n${traces.map((d) => `  "${d}",\n`).join("")}]); // ${fichier}${existsSync(chemin) ? "" : " (repli Phosphor)"}\n`,
  );
}
writeFileSync(join(RACINE, "src/components/icones-pages.tsx"), sortie.join("\n"));
console.log(manquantes.length ? `Repli Phosphor pour : ${manquantes.join(", ")}` : "Toutes les icônes viennent de public/icons");
