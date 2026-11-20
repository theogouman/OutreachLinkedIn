/*
 * Saisie de valeurs chiffrées (adaptée du « Duration Picker » de Rare UI, https://rareui.com,
 * MIT + Commons Clause + Attribution, voir THIRD_PARTY_NOTICES.md) : règles pures, sans React.
 *
 * Morphing crayon → coche : l'original l'obtient avec flubber (interpolate, maxSegmentLength 1).
 * Les deux contours, une fois appariés point à point par flubber, sont précalculés ici (94 points
 * chacun, arrondis au centième) : l'animation est une simple interpolation linéaire, identique à
 * celle de flubber, sans la dépendance (et ses six dépendances transitives).
 *
 * Copyright (c) 2026 Swami Malode — Rare UI (https://rareui.com). MIT + Commons Clause License
 * Condition v1.0 + Attribution : texte intégral et conditions dans THIRD_PARTY_NOTICES.md.
 */

type Point = readonly [number, number];
const CRAYON: readonly Point[] = [[8.7,19.88],[8.1,20.13],[7.43,20.25],[7.12,20.31],[6.14,20.48],[6.12,20.48],[5.16,20.64],[4.81,20.7],[4.19,20.8],[3.49,20.92],[3.21,20.97],[3.13,20.23],[3.18,19.93],[3.29,19.25],[3.4,18.62],[3.46,18.27],[3.62,17.3],[3.62,17.29],[3.78,16.31],[3.87,16],[4.07,15.36],[4.41,14.79],[4.58,14.51],[5.26,13.79],[5.27,13.78],[5.96,13.09],[6.21,12.84],[6.66,12.39],[7.15,11.9],[7.36,11.68],[8.07,10.98],[8.09,10.95],[8.77,10.28],[9.04,10.01],[9.47,9.58],[9.98,9.07],[10.17,8.88],[10.87,8.17],[10.92,8.13],[11.58,7.47],[11.86,7.18],[12.28,6.77],[12.8,6.24],[12.98,6.07],[13.68,5.37],[13.75,5.3],[14.38,4.66],[14.69,4.36],[15.09,3.96],[15.66,3.45],[15.82,3.3],[16.76,3],[16.89,3.03],[17.72,3.19],[18.1,3.49],[18.49,3.81],[19.08,4.39],[19.2,4.51],[19.9,5.21],[20.02,5.33],[20.59,5.92],[20.79,6.39],[20.98,6.83],[20.89,7.69],[20.88,7.8],[20.33,8.62],[20.17,8.78],[19.63,9.32],[19.23,9.72],[18.93,10.02],[18.29,10.67],[18.23,10.73],[17.53,11.43],[17.34,11.61],[16.82,12.13],[16.4,12.55],[16.12,12.83],[15.46,13.49],[15.42,13.53],[14.72,14.24],[14.52,14.43],[14.01,14.94],[13.58,15.38],[13.31,15.64],[12.63,16.32],[12.61,16.34],[11.91,17.04],[11.69,17.26],[11.21,17.75],[10.75,18.2],[10.5,18.45],[9.81,19.14],[9.8,19.15],[9.01,19.75]];
const COCHE: readonly Point[] = [[7.96,20.51],[7.56,20.04],[7.16,19.56],[6.77,19.08],[6.37,18.6],[5.97,18.13],[5.57,17.65],[5.17,17.17],[4.78,16.69],[4.38,16.21],[3.98,15.74],[3.58,15.26],[3.18,14.78],[2.79,14.3],[2.39,13.83],[1.99,13.35],[1.59,12.87],[2.36,12.23],[3.13,11.59],[3.74,12.33],[4.36,13.07],[4.97,13.8],[5.58,14.54],[6.2,15.28],[6.81,16.01],[7.43,16.75],[8.04,17.49],[8.44,17.05],[8.85,16.62],[9.25,16.18],[9.65,15.75],[10.06,15.32],[10.46,14.88],[10.86,14.45],[11.27,14.01],[11.67,13.58],[12.07,13.14],[12.48,12.71],[12.88,12.27],[13.28,11.84],[13.69,11.41],[14.09,10.97],[14.49,10.54],[14.9,10.1],[15.3,9.67],[15.7,9.23],[16.11,8.8],[16.51,8.37],[16.91,7.93],[17.32,7.5],[17.72,7.06],[18.12,6.63],[18.53,6.19],[18.93,5.76],[19.33,5.32],[19.74,4.89],[20.14,4.46],[20.54,4.02],[20.95,3.59],[21.31,3.93],[21.68,4.27],[22.05,4.61],[22.41,4.95],[21.96,5.43],[21.51,5.92],[21.06,6.41],[20.61,6.89],[20.15,7.38],[19.7,7.87],[19.25,8.35],[18.8,8.84],[18.35,9.33],[17.9,9.81],[17.44,10.3],[16.99,10.78],[16.54,11.27],[16.09,11.76],[15.64,12.24],[15.19,12.73],[14.73,13.22],[14.28,13.7],[13.83,14.19],[13.38,14.68],[12.93,15.16],[12.48,15.65],[12.02,16.14],[11.57,16.62],[11.12,17.11],[10.67,17.59],[10.22,18.08],[9.77,18.57],[9.31,19.05],[8.86,19.54],[8.41,20.03]];

/** Tracé SVG entre le crayon (0) et la coche (1), pour une progression bornée à [0, 1]. */
export function cheminCrayonCoche(progression: number): string {
  const t = Math.min(1, Math.max(0, progression));
  const r = (v: number) => Math.round(v * 100) / 100;
  return (
    "M" +
    CRAYON.map(([x, y], i) => {
      const [x2, y2] = COCHE[i]!;
      return `${r(x + (x2 - x) * t)},${r(y + (y2 - y) * t)}`;
    }).join("L") +
    "Z"
  );
}

/** Texte saisi → entier borné ; vide ou invalide → minimum. */
export function bornerSaisie(texte: string, min: number, max: number): number {
  const n = Math.trunc(Number(texte));
  if (texte.trim() === "" || !Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Pendant la frappe : au-dessus du maximum, on ramène au maximum (et le champ tremble). */
export function saisieEnCours(texte: string, max: number): { texte: string; depasse: boolean } {
  const chiffres = texte.replace(/[^0-9]/g, "").slice(0, String(max).length + 1);
  if (chiffres !== "" && Number(chiffres) > max) return { texte: String(max), depasse: true };
  return { texte: chiffres, depasse: false };
}
