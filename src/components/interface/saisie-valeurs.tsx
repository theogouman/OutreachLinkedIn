"use client";

/*
 * Saisie de valeurs chiffrées — composant par défaut de l'app pour régler un nombre (plafonds,
 * délais, cycles…). Adapté du « Duration Picker » de Rare UI (https://rareui.com, MIT + Commons
 * Clause + Attribution, voir THIRD_PARTY_NOTICES.md), même mouvement et mêmes ressorts :
 * - fermé : les champs sont soudés en une seule pastille, lecture seule, avec un crayon ;
 * - au toucher du crayon (ou d'une valeur), les segments se détachent (écart et coins « squircle »
 *   animés par ressort, léger balancement), le crayon se transforme en coche, le premier champ
 *   prend le focus ; la coche (ou Entrée, ou le focus qui quitte le composant) valide ;
 * - une valeur au-dessus du maximum est ramenée au maximum et le champ tremble ; à la validation,
 *   chaque valeur est bornée à [min, max]. Échap annule.
 * Adaptations : 1 à N champs (au lieu d'heures + minutes), bornes min / max par champ, unité par
 * champ, couleurs et graisses des jetons de l'app, champs en 16 px sur téléphone (pas d'auto-zoom
 * iOS), libellés accessibles. Dépendances de l'original retirées : flubber (morphing précalculé,
 * `saisie-valeurs-regles.ts`), react-use-measure (ResizeObserver), @radix-ui/react-slot.
 * Mouvement réduit : bascule sans animation.
 *
 * Copyright (c) 2026 Swami Malode — Rare UI (https://rareui.com). MIT + Commons Clause License
 * Condition v1.0 + Attribution : texte intégral et conditions dans THIRD_PARTY_NOTICES.md.
 */

import { getSvgPath } from "figma-squircle";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity, type MotionStyle, type MotionValue } from "motion/react";
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { bornerSaisie, cheminCrayonCoche, saisieEnCours } from "./saisie-valeurs-regles";

const ECART_OUVERT = 8;
const RAYON = 12;
const RESSORT_ECART = { stiffness: 200, damping: 28, mass: 1 };
const RESSORT_ICONE = { stiffness: 200, damping: 28 };
const RESSORT_LARGEUR = { stiffness: 250, damping: 31 };
const RESSORT_BALANCEMENT = { stiffness: 200, damping: 24 };
const RESSORT_ERREUR = { stiffness: 700, damping: 9 };

export interface SegmentSaisie {
  valeur: number;
  min: number;
  max: number;
  /** Unité affichée après la valeur (« j », « min », « /jour »…). */
  suffixe: string;
  /** Nom accessible du champ (« Invitations par jour »…). */
  libelle: string;
}

/** Taille mesurée d'un élément, en valeurs animables (pour le tracé du squircle). */
function useTailleAnimable() {
  const ref = useRef<HTMLElement | null>(null);
  const largeur = useMotionValue(0);
  const hauteur = useMotionValue(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => {
      largeur.set(el.offsetWidth);
      hauteur.set(el.offsetHeight);
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [largeur, hauteur]);
  return { ref, largeur, hauteur };
}

const rayonDe = (r: number | MotionValue<number>) => (typeof r === "number" ? r : r.get());

/** Segment aux coins « squircle » (lissage Figma), rayons gauche / droit animables. */
function Squircle({
  gauche,
  droite,
  bouton,
  className,
  style,
  children,
}: {
  gauche: number | MotionValue<number>;
  droite: number | MotionValue<number>;
  bouton?: { onClick: () => void; disabled: boolean; label: string };
  className?: string;
  style?: MotionStyle;
  children: ReactNode;
}) {
  const { ref, largeur, hauteur } = useTailleAnimable();
  const clipPath = useTransform(() => {
    const w = largeur.get();
    const h = hauteur.get();
    if (w <= 0 || h <= 0) return "none";
    const g = rayonDe(gauche);
    const d = rayonDe(droite);
    const chemin = getSvgPath({
      width: w,
      height: h,
      topLeftCornerRadius: g,
      bottomLeftCornerRadius: g,
      topRightCornerRadius: d,
      bottomRightCornerRadius: d,
      cornerSmoothing: 1,
    });
    return `path('${chemin}')`;
  });
  if (bouton) {
    return (
      <motion.button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={bouton.onClick}
        disabled={bouton.disabled}
        aria-label={bouton.label}
        className={className}
        style={{ ...style, clipPath }}
      >
        {children}
      </motion.button>
    );
  }
  return (
    <motion.div ref={ref as React.RefObject<HTMLDivElement>} className={className} style={{ ...style, clipPath }}>
      {children}
    </motion.div>
  );
}

function Champ({
  texte,
  surTexte,
  max,
  edition,
  reduit,
  desactive,
  balancement,
  libelle,
  champRef,
  surActivation,
}: {
  texte: string;
  surTexte: (t: string) => void;
  max: number;
  edition: boolean;
  reduit: boolean;
  desactive: boolean;
  balancement: MotionValue<number>;
  libelle: string;
  champRef?: React.RefObject<HTMLInputElement | null>;
  surActivation: () => void;
}) {
  const mesure = useRef<HTMLSpanElement>(null);
  const [largeurTexte, setLargeurTexte] = useState(0);
  const erreur = useSpring(0, RESSORT_ERREUR);
  const x = useTransform(() => balancement.get() + erreur.get());

  // Largeur du texte suivie en continu : au premier chargement, la police arrive après le premier
  // rendu (largeur fausse jusqu'ici) ; le ResizeObserver la remesure dès qu'elle est appliquée.
  useLayoutEffect(() => {
    const el = mesure.current;
    if (!el) return;
    const mesurer = () => setLargeurTexte(el.offsetWidth);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const largeur = edition ? Math.max(44, largeurTexte + 20) : Math.max(largeurTexte + 12, 22);
  return (
    <>
      <motion.input
        ref={champRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={libelle}
        value={texte}
        readOnly={!edition}
        disabled={desactive}
        onClick={() => !edition && surActivation()}
        onChange={(e) => {
          const r = saisieEnCours(e.target.value, max);
          surTexte(r.texte);
          if (r.depasse && !reduit) {
            erreur.jump(6);
            erreur.set(0);
          }
        }}
        style={{ x }}
        // Largeur posée sans animation au premier rendu (hydratation), animée ensuite seulement.
        initial={false}
        animate={{ width: largeur }}
        transition={reduit ? { duration: 0 } : { type: "spring", ...RESSORT_LARGEUR }}
        className={`h-full bg-transparent text-center text-base font-medium tabular-nums text-encre outline-none sm:text-[15px] ${edition ? "" : "cursor-pointer"}`}
      />
      <span ref={mesure} aria-hidden className="invisible absolute whitespace-pre text-base font-medium tabular-nums sm:text-[15px]">
        {texte || "0"}
      </span>
    </>
  );
}

export function SaisieValeurs({
  segments,
  onChange,
  libelle,
  disabled = false,
}: {
  segments: SegmentSaisie[];
  /** Valeurs bornées : à chaque frappe valide, puis à la validation. */
  onChange: (valeurs: number[]) => void;
  /** Nom accessible de l'ensemble (« Délai entre deux actions »…). */
  libelle: string;
  disabled?: boolean;
}) {
  const reduit = !!useReducedMotion();
  const [edition, setEdition] = useState(false);
  const cle = segments.map((s) => s.valeur).join(",");
  const [textes, setTextes] = useState(() => segments.map((s) => String(s.valeur)));
  // Valeurs changées par le parent (enregistrement, rechargement) : reprises hors édition.
  const [cleVue, setCleVue] = useState(cle);
  if (cleVue !== cle) {
    setCleVue(cle);
    if (!edition) setTextes(segments.map((s) => String(s.valeur)));
  }

  const ecart = useSpring(0, RESSORT_ECART);
  const ouverture = (v: number) => Math.min(ECART_OUVERT, Math.max(0, v)) / ECART_OUVERT;
  const espacement = useTransform(ecart, (v) => `${Math.min(ECART_OUVERT, Math.max(0, v)) - (1 - ouverture(v))}px`);
  const rayonInterieur = useTransform(ecart, (v) => RAYON * ouverture(v));
  const margeDroite = useTransform(ecart, (v) => `${3 + 9 * ouverture(v)}px`);
  const margeGauche = useTransform(ecart, (v) => `${9 * ouverture(v)}px`);
  const vitesse = useVelocity(ecart);
  const balancementBrut = useTransform(vitesse, [-70, 0, 70], [-3, 0, 3], { clamp: true });
  const balancement = useSpring(balancementBrut, RESSORT_BALANCEMENT);
  const progression = useSpring(0, RESSORT_ICONE);
  const chemin = useTransform(progression, (p) => cheminCrayonCoche(p));
  const epaisseurTrait = useTransform(progression, [0, 1], [0, 2.5], { clamp: true });
  const opaciteTrait = useTransform(progression, [0, 1], [0, 1], { clamp: true });
  const opaciteEncoche = useTransform(progression, [0, 0.4], [1, 0], { clamp: true });
  const premier = useRef<HTMLInputElement>(null);
  const racine = useRef<HTMLDivElement>(null);
  const avant = useRef<string[]>([]);

  const animer = (ouvrir: boolean) => {
    if (reduit) {
      ecart.jump(ouvrir ? ECART_OUVERT : 0);
      progression.jump(ouvrir ? 1 : 0);
    } else {
      ecart.set(ouvrir ? ECART_OUVERT : 0);
      progression.set(ouvrir ? 1 : 0);
    }
  };
  const valeursDe = (t: string[]) => segments.map((s, i) => bornerSaisie(t[i] ?? "", s.min, s.max));

  const ouvrir = () => {
    if (disabled || edition) return;
    avant.current = textes;
    animer(true);
    // Rendu immédiat puis focus dans le même geste : sur iPhone, le clavier ne s'ouvre que si le
    // focus est donné pendant le toucher, sur un champ déjà modifiable.
    flushSync(() => setEdition(true));
    premier.current?.focus({ preventScroll: true });
  };
  const valider = () => {
    if (!edition) return;
    const valeurs = valeursDe(textes);
    setTextes(valeurs.map(String));
    onChange(valeurs);
    animer(false);
    setEdition(false);
  };
  const annuler = () => {
    setTextes(avant.current);
    onChange(valeursDe(avant.current));
    animer(false);
    setEdition(false);
  };
  const changerTexte = (i: number, t: string) => {
    const suivants = textes.map((x, j) => (j === i ? t : x));
    setTextes(suivants);
    // Frappe valide (toutes les valeurs dans leurs bornes) : le parent suit tout de suite.
    const toutesValides = segments.every((s, j) => {
      const n = Number(suivants[j]);
      return suivants[j] !== "" && n >= s.min && n <= s.max;
    });
    if (toutesValides) onChange(suivants.map(Number));
  };

  return (
    <motion.div
      ref={racine}
      role="group"
      aria-label={libelle}
      data-edition={edition || undefined}
      className={`flex flex-row items-center ${disabled ? "opacity-50" : ""}`}
      onKeyDown={(e: KeyboardEvent) => {
        if (!edition) return;
        if (e.key === "Enter") {
          e.preventDefault();
          valider();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          annuler();
        }
      }}
      onBlur={(e: FocusEvent) => {
        // Le focus quitte le composant pendant l'édition : la saisie est validée.
        if (edition && !racine.current?.contains(e.relatedTarget as Node | null)) valider();
      }}
    >
      {segments.map((s, i) => {
        const premierSegment = i === 0;
        return (
          <Squircle
            key={i}
            gauche={premierSegment ? RAYON : rayonInterieur}
            droite={rayonInterieur}
            style={{
              paddingRight: margeDroite,
              ...(premierSegment ? {} : { marginLeft: espacement, paddingLeft: margeGauche }),
            }}
            // Arrondi CSS de repli aux extrémités : visible dès le HTML du serveur, avant que le
            // squircle (clip-path calculé en JavaScript) prenne le relais, sans saut.
            className={`flex h-11 items-center gap-1 bg-creux ${premierSegment ? "rounded-l-xl pl-2" : ""}`}
          >
            <Champ
              texte={textes[i] ?? ""}
              surTexte={(t) => changerTexte(i, t)}
              max={s.max}
              edition={edition}
              reduit={reduit}
              desactive={disabled}
              balancement={balancement}
              libelle={s.libelle}
              champRef={premierSegment ? premier : undefined}
              surActivation={ouvrir}
            />
            <motion.span style={{ x: balancement }} className="caption-4 whitespace-nowrap text-encre-3" aria-hidden>
              {s.suffixe}
            </motion.span>
          </Squircle>
        );
      })}
      <Squircle
        gauche={rayonInterieur}
        droite={RAYON}
        style={{ marginLeft: espacement }}
        bouton={{ onClick: edition ? valider : ouvrir, disabled, label: `${edition ? "Valider" : "Modifier"} : ${libelle}` }}
        className="grid size-11 place-items-center rounded-r-xl bg-creux text-encre-3 outline-none transition-transform active:scale-90 focus-visible:text-encre disabled:active:scale-100"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <motion.path
            fill="currentColor"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ strokeWidth: epaisseurTrait, strokeOpacity: opaciteTrait }}
            d={chemin}
          />
          <motion.path d="M14 6L18 10" fill="none" strokeWidth={1.5} strokeLinecap="round" stroke="var(--color-creux)" style={{ opacity: opaciteEncoche }} />
        </svg>
      </Squircle>
    </motion.div>
  );
}
