"use client";

/*
 * Rendu d'une propriété du catalogue (src/lib/proprietes/prospects.ts), commun à toutes les
 * mises en page : affichage selon le type, et éditeur sur place pour les propriétés modifiables
 * (enregistrement immédiat par actionModifierPropriete, validée côté serveur ; retour à la
 * valeur d'avant en cas de refus).
 */

import { useState, useTransition } from "react";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import { useRetour } from "@/components/interface/toasts";
import { actionModifierPropriete } from "@/app/actions";
import { PROPRIETES_PROSPECTS, type ClePropriete } from "@/lib/proprietes/prospects";
import type { LigneProspect } from "@/server/donnees";

export interface ContexteProprietes {
  /** Libellé de chaque étape (code → libellé). */
  etapes: Record<string, string>;
  /** Listes d'origine existantes (choix possibles). */
  listes: string[];
}

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export function libelleRelance(date: string | null) {
  if (!date) return { texte: "—", retard: false };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return { texte: date === aujourdhui ? "Aujourd'hui" : fmt.format(new Date(`${date}T12:00:00Z`)), retard: date <= aujourdhui };
}

/** Valeur brute d'une propriété, pour le tri. */
export function valeurPropriete(cle: ClePropriete, p: LigneProspect, ctx: ContexteProprietes): string | null {
  switch (cle) {
    case "entreprise":
      return p.entreprise;
    case "poste":
      return p.poste;
    case "relation":
      return p.statutRelation;
    case "etape":
      return ctx.etapes[p.etape] ?? p.etape;
    case "relance":
      return p.prochaineRelance;
    case "liste":
      return p.listeOrigine;
  }
}

export function ValeurPropriete({ cle, prospect, ctx }: { cle: ClePropriete; prospect: LigneProspect; ctx: ContexteProprietes }) {
  switch (cle) {
    case "entreprise":
    case "poste": {
      const t = cle === "entreprise" ? prospect.entreprise : prospect.poste;
      return <span className={`block truncate caption-4 ${t ? "text-encre-2" : "text-encre-3"}`}>{t ?? "—"}</span>;
    }
    case "relation":
      return <BadgeStatut statut={prospect.statutRelation} />;
    case "etape":
      return (
        <ChoixEtape
          key={`${prospect.id}:${prospect.etape}`}
          prospectId={prospect.id}
          nom={[prospect.prenom, prospect.nom].filter(Boolean).join(" ")}
          etape={prospect.etape}
          etapes={Object.entries(ctx.etapes).map(([code, libelle]) => ({ code, libelle }))}
        />
      );
    case "relance": {
      const r = libelleRelance(prospect.prochaineRelance);
      return <span className={`caption-4 ${r.retard ? "text-rouge" : "text-encre-3"}`}>{r.texte}</span>;
    }
    case "liste":
      return <ChoixListe key={`${prospect.id}:${prospect.listeOrigine ?? ""}`} prospect={prospect} listes={ctx.listes} />;
  }
}

/** Liste d'origine modifiable : choix parmi les listes existantes, enregistré aussitôt. */
function ChoixListe({ prospect, listes }: { prospect: LigneProspect; listes: string[] }) {
  const [valeur, setValeur] = useState(prospect.listeOrigine ?? "");
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const libelle = PROPRIETES_PROSPECTS.liste.libelle;
  const choix = prospect.listeOrigine && !listes.includes(prospect.listeOrigine) ? [prospect.listeOrigine, ...listes] : listes;

  return (
    <select
      value={valeur}
      disabled={enCours}
      aria-label={`${libelle} de ${[prospect.prenom, prospect.nom].filter(Boolean).join(" ") || "ce prospect"}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const avant = valeur;
        const nouvelle = e.target.value;
        setValeur(nouvelle);
        demarrer(async () => {
          const r = await actionModifierPropriete({ prospectId: prospect.id, cle: "liste", valeur: nouvelle || null });
          if (!r.ok) {
            setValeur(avant);
            retourner(r);
          }
        });
      }}
      className="-mx-1.5 w-[calc(100%+12px)] min-w-0 cursor-pointer truncate rounded-lg bg-transparent px-1.5 py-0.5 caption-4 text-encre-2 outline-none transition-colors duration-150 hover:bg-creux focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
    >
      <option value="">Aucune liste</option>
      {choix.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}

/**
 * Étape modifiable à la main (ex. « Gagné », qu'aucun fait LinkedIn ne constate) : le badge reste
 * visible, un sélecteur natif transparent le recouvre ; enregistrée aussitôt, retour à l'étape
 * d'avant en cas de refus. Utilisé dans les vues de la liste et dans la fiche.
 */
export function ChoixEtape({
  prospectId,
  nom,
  etape,
  etapes,
}: {
  prospectId: string;
  nom: string;
  etape: string;
  etapes: { code: string; libelle: string }[];
}) {
  const [valeur, setValeur] = useState(etape);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const libelle = etapes.find((e) => e.code === valeur)?.libelle ?? valeur;

  return (
    <span className={`relative inline-flex w-fit items-center gap-1 rounded-md focus-within:ring-2 focus-within:ring-accent ${enCours ? "opacity-60" : ""}`}>
      <BadgeEtape libelle={libelle} />
      <svg viewBox="0 0 256 256" className="size-3 shrink-0 text-encre-3" fill="currentColor" aria-hidden>
        <path d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z" />
      </svg>
      <select
        value={valeur}
        disabled={enCours}
        title="Changer l'étape"
        aria-label={`Étape de ${nom || "ce prospect"}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const avant = valeur;
          const nouvelle = e.target.value;
          setValeur(nouvelle);
          demarrer(async () => {
            const r = await actionModifierPropriete({ prospectId, cle: "etape", valeur: nouvelle });
            retourner(r.ok ? { ok: true, message: "Étape modifiée." } : r);
            if (!r.ok) setValeur(avant);
          });
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-wait"
      >
        {etapes.map((x) => (
          <option key={x.code} value={x.code}>
            {x.libelle}
          </option>
        ))}
      </select>
    </span>
  );
}
