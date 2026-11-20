"use client";

import { useState, useTransition, type ReactNode } from "react";
import { actionPlafonds, actionReglages } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { SaisieValeurs } from "@/components/interface/saisie-valeurs";
import { IconeFermer, IconeHorloge } from "@/components/icones";
import { CorpsReglage, PiedReglage } from "@/components/interface/reglage-extensible";
import { PERIODES, periodesActives } from "@/lib/reglages";
import { LIBELLES_QUOTA, MAXIMA, TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";

type Plafonds = Record<TypeQuota, { jour: number | null; semaine: number | null; mois: number | null }>;
type Reglages = {
  plages: { jours: number[]; creneaux: { debut: string; fin: string }[] };
  delaiMinS: number;
  delaiMaxS: number;
  cadence: { relance_1_jours: number; relance_2_jours: number };
};

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-[200px_1fr] sm:gap-6">
      <legend className="contents">
        <span className="flex flex-col">
          <span className="title-4 text-encre">{titre}</span>
          {aide && <span className="caption-5 text-encre-3">{aide}</span>}
        </span>
      </legend>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </fieldset>
  );
}

/**
 * Plafonds : une ligne par action, avec ses seules périodes plafonnées (pas de case vide).
 * Téléphone : les périodes l'une sous l'autre (« Par jour  [−|20|+]  max 30 »), sans défilement
 * horizontal. Écran large : colonnes jour / semaine / mois alignées sous un en-tête.
 */
export function FormPlafonds({ initial }: { initial: Plafonds }) {
  const [valeurs, setValeurs] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const colonnes = "sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,152px)] sm:gap-4";

  return (
    <form action={() => demarrer(async () => retourner(await actionPlafonds(valeurs)))}>
      <CorpsReglage>
        <div className="flex flex-col">
          <div className={`hidden pb-2 caption-4 text-encre-3 ${colonnes}`} aria-hidden>
            <span>Action</span>
            {PERIODES.map((p) => (
              <span key={p}>Par {p}</span>
            ))}
          </div>
          <ul className="divide-y divide-trait border-trait sm:border-t">
            {TYPES_QUOTA.map((t) => {
              const actives = periodesActives(t);
              return (
                <li key={t} className={`flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0 sm:items-start sm:first:pt-4 ${colonnes}`}>
                  <span className="title-4 text-encre sm:pt-1.5">{LIBELLES_QUOTA[t]}</span>
                  {PERIODES.map((p) => {
                    const max = MAXIMA[t][p];
                    // Écran large : cellule vide pour garder les colonnes alignées.
                    if (max === null || !actives.includes(p)) return <span key={p} className="hidden sm:block" aria-hidden />;
                    return (
                      <div key={p} className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
                        <span className="caption-4 text-encre-2 sm:hidden">Par {p}</span>
                        {/* Le maximum recommandé s'affiche dans la saisie (« 20 / 30 »). */}
                        <SaisieValeurs
                          libelle={`${LIBELLES_QUOTA[t]} par ${p}`}
                          segments={[{ valeur: valeurs[t][p] ?? 0, min: 0, max, suffixe: `/ ${max}`, libelle: `${LIBELLES_QUOTA[t]} par ${p}, ${max} au plus` }]}
                          onChange={([v]) => setValeurs((s) => ({ ...s, [t]: { ...s[t], [p]: v! } }))}
                        />
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      </CorpsReglage>
      <PiedReglage>
        <button type="submit" disabled={enCours} className="bouton bouton-plein">
          {enCours ? "Enregistrement…" : "Enregistrer les plafonds"}
        </button>
      </PiedReglage>
    </form>
  );
}

export function FormReglages({ initial }: { initial: Reglages }) {
  const [r, setR] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const majCreneau = (i: number, cle: "debut" | "fin", v: string) =>
    setR((s) => ({ ...s, plages: { ...s.plages, creneaux: s.plages.creneaux.map((c, j) => (j === i ? { ...c, [cle]: v } : c)) } }));

  return (
    <form action={() => demarrer(async () => retourner(await actionReglages(r)))}>
      <CorpsReglage>
        <Groupe titre="Jours actifs" aide="Aucune action hors de ces jours.">
          {/* Téléphone : les sept jours sur une seule ligne. */}
          <div className="grid w-full grid-cols-7 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
            {JOURS.map((j, i) => {
              const n = i + 1;
              const actif = r.plages.jours.includes(n);
              return (
                <label
                  key={j}
                  className={`cursor-pointer select-none rounded-[10px] py-1.5 text-center caption-3 transition-[background-color,color,box-shadow,transform] duration-200 active:scale-95 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent sm:px-3.5 ${actif ? "relief-marque" : "bg-carte text-encre-2 shadow-[inset_0_0_0_1px_var(--color-trait-fort)] hover:bg-creux"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={actif}
                    onChange={() =>
                      setR((s) => ({ ...s, plages: { ...s.plages, jours: actif ? s.plages.jours.filter((x) => x !== n) : [...s.plages.jours, n] } }))
                    }
                  />
                  {j}
                </label>
              );
            })}
          </div>
        </Groupe>

        <Groupe titre="Créneaux" aide="Jusqu'à six plages par jour.">
          <div className="flex w-full flex-col gap-2">
            {r.plages.creneaux.map((c, i) => (
              // Une ligne par créneau, même sur téléphone : début, « à », fin, retrait.
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_36px] items-center gap-2 sm:flex">
                <IconeHorloge taille={16} className="hidden text-encre-3 sm:block" />
                <input type="time" required aria-label={`Début du créneau ${i + 1}`} value={c.debut} onChange={(e) => majCreneau(i, "debut", e.target.value)} className="champ min-w-0 sm:w-auto" />
                <span className="caption-5 text-encre-3">à</span>
                <input type="time" required aria-label={`Fin du créneau ${i + 1}`} value={c.fin} onChange={(e) => majCreneau(i, "fin", e.target.value)} className="champ min-w-0 sm:w-auto" />
                {r.plages.creneaux.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Retirer le créneau ${i + 1}`}
                    title="Retirer ce créneau"
                    className="grid size-9 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: s.plages.creneaux.filter((_, j) => j !== i) } }))}
                  >
                    <IconeFermer taille={14} />
                  </button>
                ) : (
                  <span aria-hidden />
                )}
              </div>
            ))}
            {r.plages.creneaux.length < 6 && (
              <button
                type="button"
                className="bouton bouton-discret self-start px-2 py-1 caption-3 text-rouge"
                onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: [...s.plages.creneaux, { debut: "14:00", fin: "17:00" }] } }))}
              >
                + Ajouter un créneau
              </button>
            )}
          </div>
        </Groupe>

        <Groupe titre="Délai entre deux actions" aide="Tiré au hasard entre ces bornes.">
          <LigneValeur libelle="Minimum">
            <SaisieValeurs
              libelle="Délai minimum"
              segments={[{ valeur: Math.round(r.delaiMinS / 60), min: 1, max: 60, suffixe: "min", libelle: "Délai minimum en minutes" }]}
              onChange={([v]) => setR((s) => ({ ...s, delaiMinS: v! * 60 }))}
            />
          </LigneValeur>
          <LigneValeur libelle="Maximum">
            <SaisieValeurs
              libelle="Délai maximum"
              segments={[{ valeur: Math.round(r.delaiMaxS / 60), min: 1, max: 120, suffixe: "min", libelle: "Délai maximum en minutes" }]}
              onChange={([v]) => setR((s) => ({ ...s, delaiMaxS: v! * 60 }))}
            />
          </LigneValeur>
        </Groupe>

        <Groupe titre="Cadence de relances" aide="Sans réponse du prospect.">
          <LigneValeur libelle="Relance 1">
            <SaisieValeurs
              libelle="Relance 1"
              segments={[{ valeur: r.cadence.relance_1_jours, min: 1, max: 60, suffixe: "jours", libelle: "Jours avant la relance 1" }]}
              onChange={([v]) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_1_jours: v! } }))}
            />
          </LigneValeur>
          <LigneValeur libelle="Relance 2">
            <SaisieValeurs
              libelle="Relance 2"
              segments={[{ valeur: r.cadence.relance_2_jours, min: 1, max: 60, suffixe: "jours", libelle: "Jours entre relance 1 et relance 2" }]}
              onChange={([v]) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_2_jours: v! } }))}
            />
          </LigneValeur>
        </Groupe>
      </CorpsReglage>
      <PiedReglage>
        <button type="submit" disabled={enCours} className="bouton bouton-plein">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </PiedReglage>
    </form>
  );
}

/** Une valeur réglable : libellé à gauche, saisie (avec son unité) à droite (pleine ligne sur téléphone). */
function LigneValeur({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
      <span className="caption-4 text-encre-2 sm:w-20">{libelle}</span>
      {children}
    </div>
  );
}
