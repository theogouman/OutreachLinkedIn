"use client";

/*
 * Ligne qu'on glisse pour révéler des actions, portage web de « Swipeable List » de beUI Native
 * (https://beui.dev/react-native/swipeable-list, MIT, © 2026 beUI and Saurabh ; notice dans
 * THIRD_PARTY_NOTICES.md). Mêmes règles et mêmes valeurs :
 * - la ligne suit le doigt (ou la souris), avec une résistance élastique au-delà des actions ;
 * - les panneaux d'action s'élargissent avec le glissé, leur contenu apparaît en fondu et zoom ;
 * - lâchée au-delà de 40 % des actions (ou lancée vite), la ligne reste ouverte ; sinon elle revient ;
 * - glissée assez loin (actions + 64 px, et 55 % de la ligne), l'action extérieure « s'arme » :
 *   elle prend toute la place, et la lâcher l'exécute, la ligne partant hors de l'écran ;
 * - ressorts : repos 420 / 38 / 0,9, armement 520 / 30 / 0,7 ; départ 220 ms, courbe (0.16, 1, 0.3, 1).
 * Une seule ligne ouverte à la fois (état tenu par la liste). Toucher une ligne ouverte la referme.
 * Clavier : flèche gauche ou droite sur la ligne pour ouvrir ses actions, Échap pour refermer.
 * Mouvement réduit : positions posées sans ressort.
 * Adaptations web : événements de pointeur (direction décidée dans les 10 premiers pixels, le
 * défilement vertical reste au navigateur), positions écrites directement dans le DOM.
 */

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

export type CoteGlisse = "gauche" | "droite";
export type LigneOuverte = { id: string; cote: CoteGlisse } | null;

export interface ActionGlissee {
  id: string;
  libelle: string;
  icone: ReactNode;
  /** Couleur du panneau : neutre (encre) ou danger (rouge). */
  ton?: "neutre" | "danger";
  executer: () => void;
}

const REPOS = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.9 };
const ARMEMENT = { type: "spring" as const, stiffness: 520, damping: 30, mass: 0.7 };
const DEPART = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const VITESSE_OUVERTURE = 600;
const VITESSE_FERMETURE = 300;
const PART_OUVERTURE = 0.4;
const DISTANCE_LANCER = 14;
const DEPASSEMENT_ARME = 64;
const PART_ARME = 0.55;
const DELAI_RETOUR = 320;
const SEUIL_DIRECTION = 10;
/** Rayon de la ligne : le panneau voisin passe sous ses coins arrondis. */
const COIN = 16;
const LARGEUR_ACTION = 72;

const FOND: Record<NonNullable<ActionGlissee["ton"]>, string> = {
  neutre: "bg-encre-2 text-carte",
  danger: "bg-action text-white",
};

/** Résistance façon iOS : plus on tire, moins ça avance. */
function elastique(depassement: number, dimension: number) {
  const signe = depassement < 0 ? -1 : 1;
  const d = Math.abs(depassement);
  return (signe * (d * dimension * 0.55)) / (dimension + 0.55 * d);
}

export function LigneGlissante({
  id,
  ouverte,
  changerOuverte,
  actionsGauche = [],
  actionsDroite = [],
  libelleActions,
  children,
}: {
  id: string;
  ouverte: LigneOuverte;
  changerOuverte: (o: LigneOuverte) => void;
  /** Révélées en glissant vers la droite ; la première est à l'extérieur (glissé complet). */
  actionsGauche?: ActionGlissee[];
  /** Révélées en glissant vers la gauche ; la dernière est à l'extérieur (glissé complet). */
  actionsDroite?: ActionGlissee[];
  /** Annoncé aux lecteurs d'écran : comment atteindre les actions au clavier. */
  libelleActions: string;
  children: ReactNode;
}) {
  const reduit = !!useReducedMotion();
  const largeurGauche = actionsGauche.length * LARGEUR_ACTION;
  const largeurDroite = actionsDroite.length * LARGEUR_ACTION;
  const coteOuvert = ouverte?.id === id ? ouverte.cote : null;
  const autreOuverte = ouverte !== null && ouverte.id !== id;
  const reposPour = useCallback((c: CoteGlisse | null) => (c === "gauche" ? largeurGauche : c === "droite" ? -largeurDroite : 0), [largeurGauche, largeurDroite]);

  const x = useMotionValue(reposPour(coteOuvert));
  const arme = useMotionValue(0);
  const estArmee = useRef(false);
  const commande = useRef(reposPour(coteOuvert));
  const animX = useRef<AnimationPlaybackControls | null>(null);
  const animArme = useRef<AnimationPlaybackControls | null>(null);
  const monte = useRef(true);
  useEffect(
    () => () => {
      monte.current = false;
    },
    [],
  );

  const racine = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const panneaux = useRef<Record<string, HTMLDivElement | null>>({});
  const contenus = useRef<Record<string, HTMLSpanElement | null>>({});

  /** Positions des panneaux et de la ligne, calculées comme dans beUI et écrites dans le DOM. */
  const appliquer = useCallback(() => {
    const ligne = racine.current;
    if (!ligne || !surface.current) return;
    const v = x.get();
    const a = arme.get();
    const largeur = ligne.offsetWidth;
    surface.current.style.transform = `translate3d(${v}px, 0, 0)`;
    for (const [cote, actions] of [
      ["gauche", actionsGauche],
      ["droite", actionsDroite],
    ] as const) {
      const nombre = actions.length;
      if (!nombre) continue;
      const revele = Math.max(0, cote === "gauche" ? v : -v);
      const part = revele / nombre;
      const exterieur = cote === "gauche" ? 0 : nombre - 1;
      const interieur = cote === "gauche" ? nombre - 1 : 0;
      const largeurDe = (i: number) => (i === exterieur ? part + (revele - part) * a : part * (1 - a));
      const repli = Math.min(COIN, revele);
      let decalage = 0;
      actions.forEach((action, i) => {
        const p = panneaux.current[`${cote}:${action.id}`];
        const c = contenus.current[`${cote}:${action.id}`];
        const l = largeurDe(i);
        if (p) {
          let debut: number;
          let fin: number;
          if (cote === "droite") {
            const bord = largeur - revele;
            debut = bord + decalage;
            if (i === interieur) debut -= repli;
            if (i === exterieur && nombre > 1) debut += (bord - repli - debut) * a;
            fin = bord + decalage + l;
            p.style.paddingLeft = `${Math.max(0, bord - debut)}px`;
            p.style.paddingRight = "0px";
          } else {
            const bord = revele;
            debut = decalage;
            fin = decalage + l;
            if (i === interieur) fin += repli;
            if (i === exterieur && nombre > 1) fin += (bord + repli - fin) * a;
            p.style.paddingLeft = "0px";
            p.style.paddingRight = `${Math.max(0, fin - bord)}px`;
          }
          p.style.left = `${debut}px`;
          p.style.width = `${Math.max(0, fin - debut)}px`;
          p.style.zIndex = i === exterieur ? "1" : "0";
          // Armée, l'action extérieure se cale contre le bord de la ligne.
          p.style.alignItems = i === exterieur && a > 0.5 ? (cote === "gauche" ? "flex-end" : "flex-start") : "center";
        }
        if (c) {
          // Le contenu garde sa taille et apparaît à mesure que son panneau lui fait de la place.
          const vu = Math.min(1, Math.max(0, (l - 24) / 40));
          c.style.opacity = String(vu);
          c.style.transform = `scale(${0.7 + 0.3 * vu})`;
        }
        decalage += l;
      });
    }
  }, [actionsDroite, actionsGauche, arme, x]);

  useMotionValueEvent(x, "change", appliquer);
  useMotionValueEvent(arme, "change", appliquer);
  useLayoutEffect(() => {
    appliquer();
    const el = racine.current;
    if (!el) return;
    const obs = new ResizeObserver(appliquer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [appliquer]);

  const poser = useCallback(
    (cible: number, vitesse = 0) => {
      animX.current?.stop();
      if (reduit) x.set(cible);
      else animX.current = animate(x, cible, { ...REPOS, velocity: vitesse * 0.6 });
    },
    [reduit, x],
  );
  const armer = useCallback(
    (oui: boolean) => {
      estArmee.current = oui;
      animArme.current?.stop();
      if (reduit) arme.set(oui ? 1 : 0);
      else animArme.current = animate(arme, oui ? 1 : 0, ARMEMENT);
    },
    [arme, reduit],
  );

  // Suit les changements venus d'ailleurs (une autre ligne qui s'ouvre referme celle-ci).
  useEffect(() => {
    const cible = reposPour(coteOuvert);
    if (commande.current === cible) return;
    commande.current = cible;
    poser(cible);
  }, [coteOuvert, poser, reposPour]);

  const valider = useCallback(
    (c: CoteGlisse | null) => {
      commande.current = reposPour(c);
      changerOuverte(c ? { id, cote: c } : null);
    },
    [changerOuverte, id, reposPour],
  );

  const executer = useCallback(
    (action: ActionGlissee, complet: boolean) => {
      action.executer();
      commande.current = 0;
      changerOuverte(null);
      if (!complet) poser(0);
    },
    [changerOuverte, poser],
  );

  // Glissé complet : la ligne part hors de l'écran ; si l'action la retire, sa sortie la replie
  // depuis là. Sinon elle revient au repos.
  const glisseComplet = useCallback(
    (c: CoteGlisse) => {
      const action = c === "gauche" ? actionsGauche[0] : actionsDroite[actionsDroite.length - 1];
      if (action) executer(action, true);
      window.setTimeout(() => {
        if (!monte.current) return;
        poser(0);
        armer(false);
      }, DELAI_RETOUR);
    },
    [actionsDroite, actionsGauche, armer, executer, poser],
  );

  // ─── Geste ─────────────────────────────────────────────────────────────────
  const geste = useRef<{ x0: number; y0: number; depart: number; etat: "attente" | "glisse" | "abandon"; points: { x: number; t: number }[] } | null>(null);
  const aGlisse = useRef(false);

  const surAppui = (e: React.PointerEvent) => {
    if (e.button !== 0 || (!largeurGauche && !largeurDroite)) return;
    geste.current = { x0: e.clientX, y0: e.clientY, depart: x.get(), etat: "attente", points: [{ x: e.clientX, t: e.timeStamp }] };
  };

  const surMouvement = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g || g.etat === "abandon") return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.etat === "attente") {
      // L'intention horizontale prend la ligne ; l'intention verticale laisse défiler la liste.
      if (Math.abs(dy) > SEUIL_DIRECTION && Math.abs(dy) >= Math.abs(dx)) {
        g.etat = "abandon";
        return;
      }
      if (Math.abs(dx) <= SEUIL_DIRECTION) return;
      g.etat = "glisse";
      aGlisse.current = true;
      animX.current?.stop();
      g.depart = x.get();
      surface.current?.setPointerCapture(e.pointerId);
      if (autreOuverte) changerOuverte(null);
    }
    g.points.push({ x: e.clientX, t: e.timeStamp });
    if (g.points.length > 6) g.points.shift();

    const brut = g.depart + dx;
    const largeur = racine.current?.offsetWidth || 1;
    const completGauche = actionsGauche.length > 0;
    const completDroite = actionsDroite.length > 0;
    // Le glissé complet va librement jusqu'au bord ; sinon la résistance commence après les actions.
    const maxGauche = largeurGauche > 0 ? (completGauche ? largeur : largeurGauche) : 0;
    const maxDroite = largeurDroite > 0 ? (completDroite ? largeur : largeurDroite) : 0;
    const v = brut > maxGauche ? maxGauche + elastique(brut - maxGauche, largeur) : brut < -maxDroite ? -maxDroite + elastique(brut + maxDroite, largeur) : brut;
    x.set(v);

    const cote: CoteGlisse | null = v > 0 ? "gauche" : v < 0 ? "droite" : null;
    const seuil = Math.max((cote === "gauche" ? largeurGauche : largeurDroite) + DEPASSEMENT_ARME, largeur * PART_ARME);
    const permis = cote === "gauche" ? completGauche : completDroite;
    const maintenant = cote !== null && permis && Math.abs(v) > seuil;
    if (maintenant !== estArmee.current) armer(maintenant);
  };

  const surRelache = (e: React.PointerEvent) => {
    const g = geste.current;
    geste.current = null;
    if (!g || g.etat !== "glisse") return;
    if (surface.current?.hasPointerCapture(e.pointerId)) surface.current.releasePointerCapture(e.pointerId);
    const premier = g.points[0]!;
    const dernier = g.points[g.points.length - 1]!;
    const duree = Math.max(1, dernier.t - premier.t);
    const vitesse = ((dernier.x - premier.x) / duree) * 1000;
    const v = x.get();
    const largeur = racine.current?.offsetWidth || 1;

    if (estArmee.current) {
      const c: CoteGlisse = v > 0 ? "gauche" : "droite";
      animX.current?.stop();
      if (reduit) x.set(c === "gauche" ? largeur : -largeur);
      else animX.current = animate(x, c === "gauche" ? largeur : -largeur, DEPART);
      glisseComplet(c);
      return;
    }

    let c: CoteGlisse | null = null;
    if (coteOuvert === "gauche") c = v < largeurGauche * 0.6 || vitesse < -VITESSE_FERMETURE ? null : "gauche";
    else if (coteOuvert === "droite") c = -v < largeurDroite * 0.6 || vitesse > VITESSE_FERMETURE ? null : "droite";
    else if (largeurGauche > 0 && v > 0 && (v > largeurGauche * PART_OUVERTURE || (vitesse > VITESSE_OUVERTURE && v > DISTANCE_LANCER))) c = "gauche";
    else if (largeurDroite > 0 && v < 0 && (-v > largeurDroite * PART_OUVERTURE || (vitesse < -VITESSE_OUVERTURE && v < -DISTANCE_LANCER))) c = "droite";
    poser(reposPour(c), vitesse);
    valider(c);
  };

  // Un glissé ne déclenche pas le lien ; toucher une ligne ouverte la referme.
  const surClic = (e: React.MouseEvent) => {
    if (aGlisse.current) {
      aGlisse.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (coteOuvert) {
      e.preventDefault();
      e.stopPropagation();
      poser(0);
      valider(null);
    }
  };

  const clavier = (e: React.KeyboardEvent) => {
    const ouvrir = (c: CoteGlisse) => {
      poser(reposPour(c));
      valider(c);
      requestAnimationFrame(() => racine.current?.querySelector<HTMLButtonElement>(`[data-cote="${c}"] button`)?.focus());
    };
    if (e.key === "ArrowLeft" && largeurDroite && coteOuvert !== "droite") {
      e.preventDefault();
      ouvrir("droite");
    } else if (e.key === "ArrowRight" && largeurGauche && coteOuvert !== "gauche") {
      e.preventDefault();
      ouvrir("gauche");
    } else if (e.key === "Escape" && coteOuvert) {
      e.preventDefault();
      e.stopPropagation();
      poser(0);
      valider(null);
      racine.current?.querySelector<HTMLElement>("a, [tabindex]")?.focus();
    }
  };

  const panneau = (cote: CoteGlisse, action: ActionGlissee) => (
    <div
      key={`${cote}:${action.id}`}
      ref={(el) => {
        panneaux.current[`${cote}:${action.id}`] = el;
      }}
      data-cote={cote}
      inert={coteOuvert !== cote}
      className={`absolute inset-y-0 flex flex-col justify-center overflow-hidden ${FOND[action.ton ?? "neutre"]}`}
      style={{ left: 0, width: 0 }}
    >
      <button
        type="button"
        onClick={() => executer(action, false)}
        aria-label={action.libelle}
        className="flex h-full w-full flex-col justify-center px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
        style={{ alignItems: "inherit" }}
      >
        <span
          ref={(el) => {
            contenus.current[`${cote}:${action.id}`] = el;
          }}
          className="flex min-w-12 flex-col items-center gap-1"
          style={{ opacity: 0 }}
        >
          {action.icone}
          <span className="whitespace-nowrap text-[11px] font-medium leading-none">{action.libelle}</span>
        </span>
      </button>
    </div>
  );

  return (
    <div ref={racine} className="relative overflow-hidden rounded-2xl" onKeyDown={clavier}>
      {actionsGauche.map((a) => panneau("gauche", a))}
      {actionsDroite.map((a) => panneau("droite", a))}
      <div
        ref={surface}
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={surRelache}
        onClickCapture={surClic}
        aria-description={libelleActions}
        className="relative z-[2] touch-pan-y select-none rounded-2xl bg-carte ring-1 ring-inset ring-trait shadow-[0_1px_2px_rgba(0,0,0,0.06)] [-webkit-touch-callout:none]"
      >
        {children}
      </div>
    </div>
  );
}
