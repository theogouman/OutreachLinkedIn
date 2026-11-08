// Génère les splash screens iOS (public/splash), couleur unie #f5f2f2.
// Adapté de Notion-Club/Infrastructure (scripts/generate-ios-splash.mjs). Pur Node (zlib).
// Usage : node scripts/generer-splash-ios.mjs
// La liste APPAREILS doit rester identique à src/lib/pwa-ios.ts (vérifié par un test).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), "..", "public/splash");
const COULEUR = [245, 242, 242];
const APPAREILS = [
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])), 0);
  return Buffer.concat([longueur, t, donnees, crc]);
}
function pngUni(largeur, hauteur, [r, g, b]) {
  const ligne = Buffer.alloc(largeur * 3 + 1);
  for (let x = 0; x < largeur; x++) ligne.set([r, g, b], 1 + x * 3);
  const brut = Buffer.concat(Array.from({ length: hauteur }, () => ligne));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc("IHDR", ihdr),
    bloc("IDAT", deflateSync(brut, { level: 9 })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(SORTIE, { recursive: true });
for (const [l, h, d] of APPAREILS) {
  const nom = `apple-splash-${l * d}-${h * d}.png`;
  writeFileSync(join(SORTIE, nom), pngUni(l * d, h * d, COULEUR));
  console.log(nom);
}
