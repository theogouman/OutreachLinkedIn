"use client";
/*
 * Placeholder animé des champs de saisie : effet « Blur Out Up » d'animate-text (pixel-point),
 * réimplémenté en Web Animations API d'après ses paramètres publiés (timings du site :
 * durées × 0,72, déplacement vertical × 0,58 ; découpage par mot ; enchaînement en fondu croisé).
 *
 * - Premier caractère tapé : le placeholder part vers le haut en se floutant, le texte saisi arrive
 *   depuis le bas (net, sans flou).
 * - Champ vidé : le texte effacé part vers le haut en se floutant, le placeholder revient.
 *
 * Le champ garde sa valeur et son curseur : pendant l'arrivée, son texte est rendu transparent et une
 * copie animée est affichée par-dessus, alignée sur sa police et ses marges. Le champ ne doit pas avoir
 * d'attribut `placeholder` (l'étiquette accessible vient de son <label> ou de aria-label). Ce composant
 * se place dans le même parent que le champ (enfant direct, input ou textarea), parent positionné
 * (relative). Mouvement réduit : bascule sans animation.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

const ENTREE = { duree: 403, decalage: 20, courbe: "cubic-bezier(0.22, 1, 0.36, 1)" };
const SORTIE = { duree: 346, decalage: 17, courbe: "cubic-bezier(0.64, 0, 0.78, 0)" };
const CHEVAUCHEMENT_MS = 170;

const cadre = (opacite: number, y: number, flou: number): Keyframe => ({
  opacity: opacite,
  transform: `translate3d(0, ${y}px, 0)`,
  filter: `blur(${flou}px)`,
});
const IMMOBILE = cadre(1, 0, 0);
const AVANT_ENTREE = cadre(0, 10 * 0.58, 6);
const APRES_SORTIE = cadre(0, -14 * 0.58, 8);

const totalSortie = (n: number) => SORTIE.duree + Math.max(0, n - 1) * SORTIE.decalage;

type Champ = HTMLInputElement | HTMLTextAreaElement;

/** Le champ voisin de la couche animée (enfant direct du même parent). */
function trouverChamp(hote: HTMLElement | null): Champ | null {
  return hote?.parentElement?.querySelector<Champ>(":scope > input, :scope > textarea") ?? null;
}

/** Remplit `parent` avec le texte découpé par mot ; renvoie les mots (les espaces ne s'animent pas). */
function decouper(parent: HTMLElement, texte: string): HTMLElement[] {
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

export function TexteSaisieAnime({
  valeur,
  placeholder,
}: {
  valeur: string;
  placeholder: string;
}) {
  const hote = useRef<HTMLSpanElement>(null);

  const couches = useRef<{ ph: HTMLSpanElement; fantome: HTMLSpanElement } | null>(null);
  const anims = useRef<Animation[]>([]);
  const entreeEnCours = useRef(false);
  const precedent = useRef(valeur);
  const placeholderCourant = useRef(placeholder);

  /** Aligne la couche sur le champ (position, police, marges), relu à chaque animation. */
  const aligner = () => {
    const h = hote.current;
    const c = trouverChamp(hote.current);
    if (!h || !c) return;
    const s = getComputedStyle(c);
    const multiligne = c instanceof HTMLTextAreaElement;
    Object.assign(h.style, {
      left: `${c.offsetLeft}px`,
      top: `${c.offsetTop}px`,
      width: `${c.offsetWidth}px`,
      height: `${c.offsetHeight}px`,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      paddingTop: `calc(${s.paddingTop} + ${s.borderTopWidth})`,
      paddingBottom: `calc(${s.paddingBottom} + ${s.borderBottomWidth})`,
      paddingLeft: `calc(${s.paddingLeft} + ${s.borderLeftWidth})`,
      paddingRight: `calc(${s.paddingRight} + ${s.borderRightWidth})`,
      alignContent: multiligne ? "start" : "center",
    });
    for (const couche of [couches.current?.ph, couches.current?.fantome]) {
      if (!couche) continue;
      couche.style.whiteSpace = multiligne ? "pre-wrap" : "pre";
      couche.style.overflowWrap = multiligne ? "anywhere" : "normal";
    }
  };

  const arreter = () => {
    for (const a of anims.current) a.cancel();
    anims.current = [];
    entreeEnCours.current = false;
    const c = trouverChamp(hote.current);
    if (c) {
      c.style.color = "";
      c.style.caretColor = "";
    }
    if (couches.current) {
      couches.current.fantome.replaceChildren();
      couches.current.fantome.style.visibility = "hidden";
    }
  };

  // Couches créées une fois ; React ne gère pas leur contenu (l'hôte n'a pas d'enfants React).
  useLayoutEffect(() => {
    const h = hote.current;
    if (!h) return;
    const ph = document.createElement("span");
    const fantome = document.createElement("span");
    for (const couche of [ph, fantome]) {
      couche.style.gridArea = "1 / 1";
      couche.style.overflowX = "clip";
    }
    ph.style.color = "var(--color-encre-3)";
    fantome.style.visibility = "hidden";
    h.append(ph, fantome);
    couches.current = { ph, fantome };
    decouper(ph, placeholderCourant.current);
    ph.style.visibility = precedent.current ? "hidden" : "visible";
    aligner();
    const obs = new ResizeObserver(aligner);
    const c = trouverChamp(h);
    if (c) obs.observe(c);
    return () => {
      obs.disconnect();
      arreter();
      h.replaceChildren();
      couches.current = null;
    };
    // Montage seulement : les changements de valeur et de placeholder ont leurs propres effets.
  }, []);

  // Placeholder modifié (ex. envoi bloqué) : mis à jour sans animation.
  useEffect(() => {
    placeholderCourant.current = placeholder;
    const ph = couches.current?.ph;
    if (ph && !anims.current.length) decouper(ph, placeholder);
  }, [placeholder]);

  useLayoutEffect(() => {
    const prec = precedent.current;
    precedent.current = valeur;
    const cs = couches.current;
    const c = trouverChamp(hote.current);
    if (!cs || !c) return;

    // Texte qui continue de s'écrire pendant son arrivée : la copie suit.
    if (!!prec === !!valeur) {
      if (entreeEnCours.current) cs.fantome.textContent = valeur;
      return;
    }

    arreter();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cs.ph.style.visibility = valeur ? "hidden" : "visible";
      return;
    }
    aligner();

    if (valeur) {
      // Le placeholder part…
      const mots = decouper(cs.ph, placeholderCourant.current);
      cs.ph.style.visibility = "visible";
      mots.forEach((m, i) => {
        anims.current.push(
          m.animate([IMMOBILE, APRES_SORTIE], { duration: SORTIE.duree, delay: i * SORTIE.decalage, easing: SORTIE.courbe, fill: "forwards" }),
        );
      });
      // …le texte saisi arrive (le champ reste éditable, son texte est masqué le temps de l'arrivée).
      const couleur = getComputedStyle(c).color;
      c.style.caretColor = couleur;
      c.style.color = "transparent";
      cs.fantome.textContent = valeur;
      cs.fantome.style.color = couleur;
      cs.fantome.style.visibility = "visible";
      entreeEnCours.current = true;
      const arrivee = cs.fantome.animate([AVANT_ENTREE, IMMOBILE], {
        duration: ENTREE.duree,
        delay: Math.max(0, totalSortie(mots.length) - CHEVAUCHEMENT_MS),
        easing: ENTREE.courbe,
        fill: "backwards",
      });
      anims.current.push(arrivee);
      arrivee.finished
        .then(() => {
          cs.ph.style.visibility = "hidden";
          arreter();
        })
        .catch(() => {}); // annulée par une nouvelle transition
    } else {
      // Le texte effacé part…
      cs.fantome.style.color = getComputedStyle(c).color;
      const partants = decouper(cs.fantome, prec);
      cs.fantome.style.visibility = "visible";
      const fins = partants.map((m, i) => {
        const a = m.animate([IMMOBILE, APRES_SORTIE], { duration: SORTIE.duree, delay: i * SORTIE.decalage, easing: SORTIE.courbe, fill: "forwards" });
        anims.current.push(a);
        return a.finished;
      });
      // …le placeholder revient, mot par mot.
      const retour = Math.max(0, totalSortie(partants.length) - CHEVAUCHEMENT_MS);
      const mots = decouper(cs.ph, placeholderCourant.current);
      cs.ph.style.visibility = "visible";
      mots.forEach((m, i) => {
        const a = m.animate([AVANT_ENTREE, IMMOBILE], { duration: ENTREE.duree, delay: retour + i * ENTREE.decalage, easing: ENTREE.courbe, fill: "backwards" });
        anims.current.push(a);
        fins.push(a.finished);
      });
      Promise.all(fins)
        .then(() => arreter())
        .catch(() => {});
    }
    // `aligner` et `arreter` ne lisent que des refs.
  }, [valeur]);

  return (
    <span
      ref={hote}
      aria-hidden
      className="pointer-events-none absolute grid select-none overflow-visible"
      style={{ boxSizing: "border-box" }}
    />
  );
}
