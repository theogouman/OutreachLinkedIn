/*
 * Paramètres communs de l'effet « Blur Out Up » d'animate-text (pixel-point), réimplémenté en Web
 * Animations API d'après ses paramètres publiés (timings du site : durées × 0,72, déplacement
 * vertical × 0,58 ; découpage par mot ; enchaînement en fondu croisé). Utilisé par le placeholder
 * animé des champs (texte-saisie-anime.tsx) et par les textes qui changent (texte-anime.tsx).
 */

export const ENTREE = { duree: 403, decalage: 20, courbe: "cubic-bezier(0.22, 1, 0.36, 1)" };
export const SORTIE = { duree: 346, decalage: 17, courbe: "cubic-bezier(0.64, 0, 0.78, 0)" };
export const CHEVAUCHEMENT_MS = 170;

export const cadre = (opacite: number, y: number, flou: number): Keyframe => ({
  opacity: opacite,
  transform: `translate3d(0, ${y}px, 0)`,
  filter: `blur(${flou}px)`,
});
export const IMMOBILE = cadre(1, 0, 0);
export const AVANT_ENTREE = cadre(0, 10 * 0.58, 6);
export const APRES_SORTIE = cadre(0, -14 * 0.58, 8);

export const totalSortie = (n: number) => SORTIE.duree + Math.max(0, n - 1) * SORTIE.decalage;

/** Remplit `parent` avec le texte découpé par mot ; renvoie les mots (les espaces ne s'animent pas). */
export function decouper(parent: HTMLElement, texte: string): HTMLElement[] {
  parent.replaceChildren();
  const mots: HTMLElement[] = [];
  for (const morceau of texte.match(/(\S+|\s+)/g) ?? []) {
    const s = document.createElement("span");
    s.textContent = morceau;
    s.style.whiteSpace = "pre-wrap";
    if (/\S/.test(morceau)) {
      s.style.display = "inline-block";
      s.style.whiteSpace = "pre";
      s.style.transformOrigin = "50% 55%";
      s.style.backfaceVisibility = "hidden";
      mots.push(s);
    }
    parent.append(s);
  }
  return mots;
}

