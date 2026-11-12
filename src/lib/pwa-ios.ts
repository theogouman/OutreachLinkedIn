/*
 * Splash screens iOS (apple-touch-startup-image), repris de Notion-Club/Infrastructure.
 * iOS n'affiche un écran de lancement que si l'image a la résolution physique EXACTE de
 * l'appareil, sinon écran blanc. Une seule couleur (#f5f2f2), sans variante sombre : iOS
 * ne bascule pas le splash de façon fiable selon le thème.
 * Liste à garder synchronisée avec scripts/generer-splash-ios.mjs (test : pwa-ios.test.ts).
 */

// [largeur logique, hauteur logique, densité]
export const APPAREILS_IOS: ReadonlyArray<readonly [number, number, number]> = [
  [375, 667, 2], // iPhone SE 2/3, 8
  [414, 736, 3], // iPhone 8 Plus
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 2], // iPhone XR, 11
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [390, 844, 3], // iPhone 12, 13, 14
  [393, 852, 3], // iPhone 14 Pro, 15, 16
  [402, 874, 3], // iPhone 16 Pro
  [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
  [430, 932, 3], // iPhone 14 Pro Max, 15/16 Plus
  [440, 956, 3], // iPhone 16 Pro Max
];

export const SPLASH_IOS = APPAREILS_IOS.map(([l, h, d]) => ({
  media: `(device-width: ${l}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)`,
  href: `/splash/apple-splash-${l * d}-${h * d}.png`,
}));

/** Couleur de la surface : manifest, barre d'état, splash. */
export const COULEUR_SURFACE = "#f5f2f2";
/** Surface en mode sombre (même valeur que --color-surface sous prefers-color-scheme: dark). */
export const COULEUR_SURFACE_SOMBRE = "#0f0f10";
