"use client";

import { useState, useTransition, type ReactNode } from "react";
import { actionPlafonds, actionReglages } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { Compteur } from "@/components/interface/compteur";
import { IconeCalendrier, IconeHorloge, IconeFiltre } from "@/components/icones";
import { LIBELLES_QUOTA, MAXIMA, TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";

type Plafonds = Record<TypeQuota, { jour: number | null; semaine: number | null; mois: number | null }>;
type Reglages = {
  plages: { jours: number[]; creneaux: { debut: string; fin: string }[] };
  delaiMinS: number;
  delaiMaxS: number;
  cadence: { relance_1_jours: number; relance_2_jours: number };
};

const PERIODES = ["jour", "semaine", "mois"] as const;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function Section({ icone, titre, description, children, pied }: { icone: ReactNode; titre: string; description?: string; children: ReactNode; pied?: ReactNode }) {
  return (
    <div className="carte overflow-hidden">
      <div className="flex gap-3 px-6 pt-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-doux text-action" aria-hidden>{icone}</span>
        <div className="min-w-0">
          <h2 className="title-2 text-encre">{titre}</h2>
          {description && <p className="mt-0.5 body-6 text-encre-3">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-6 px-6 py-6">{children}</div>
      {pied && <div className="flex items-center justify-end gap-3 border-t border-trait bg-creux px-6 py-3">{pied}</div>}
    </div>
  );
}

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-[220px_1fr] sm:gap-6">
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

export function FormPlafonds({ initial }: { initial: Plafonds }) {
  const [valeurs, setValeurs] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();

  return (
    <form action={() => demarrer(async () => retourner(await actionPlafonds(valeurs)))}>
      <Section
        icone={<IconeFiltre taille={18} />}
        titre="Plafonds du compte LinkedIn"
        description="Compte gratuit. Jamais au-dessus de la recommandation Unipile, indiquée sous chaque valeur."
        pied={<button type="submit" disabled={enCours} className="bouton bouton-plein">{enCours ? "Enregistrement…" : "Enregistrer les plafonds"}</button>}
      >
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left caption-4 text-encre-3">
                <th className="pb-3 font-medium">Action</th>
                {PERIODES.map((p) => <th key={p} className="pb-3 font-medium">Par {p}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {TYPES_QUOTA.map((t) => (
                <tr key={t}>
                  <td className="py-3 pr-4 title-4 text-encre">{LIBELLES_QUOTA[t]}</td>
                  {PERIODES.map((p) => {
                    const max = MAXIMA[t][p];
                    return (
                      <td key={p} className="py-3 pr-4 align-top">
                        {max === null ? (
                          <span className="caption-5 text-encre-3" aria-label="Non plafonné sur cette période">—</span>
                        ) : (
                          <span className="flex flex-col gap-1">
                            <Compteur
                              valeur={valeurs[t][p] ?? 0}
                              min={0}
                              max={max}
                              libelle={`${LIBELLES_QUOTA[t]} par ${p}`}
                              onChange={(v) => setValeurs((s) => ({ ...s, [t]: { ...s[t], [p]: v } }))}
                            />
                            <span className="caption-5 text-encre-3">max {max}</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
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
      <Section
        icone={<IconeCalendrier taille={18} />}
        titre="Rythme d'activité"
        description="Quand l'outil a le droit d'agir, et à quelle allure. Heure de Paris."
        pied={<button type="submit" disabled={enCours} className="bouton bouton-plein">{enCours ? "Enregistrement…" : "Enregistrer"}</button>}
      >
        <Groupe titre="Jours actifs" aide="Aucune action hors de ces jours.">
          {JOURS.map((j, i) => {
            const n = i + 1;
            const actif = r.plages.jours.includes(n);
            return (
              <label
                key={j}
                className={`cursor-pointer select-none rounded-lg px-3 py-1.5 caption-3 transition-[background-color,color,box-shadow,transform] duration-200 active:scale-95 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${actif ? "bg-action text-white" : "bg-carte text-encre-2 shadow-[inset_0_0_0_1px_var(--color-trait-fort)] hover:bg-creux"}`}
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
        </Groupe>

        <Groupe titre="Créneaux" aide="Jusqu'à six plages par jour.">
          <div className="flex w-full flex-col gap-2">
            {r.plages.creneaux.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <IconeHorloge taille={16} className="text-encre-3" />
                <input type="time" required aria-label={`Début du créneau ${i + 1}`} value={c.debut} onChange={(e) => majCreneau(i, "debut", e.target.value)} className="champ w-auto" />
                <span className="caption-5 text-encre-3">à</span>
                <input type="time" required aria-label={`Fin du créneau ${i + 1}`} value={c.fin} onChange={(e) => majCreneau(i, "fin", e.target.value)} className="champ w-auto" />
                {r.plages.creneaux.length > 1 && (
                  <button
                    type="button"
                    className="bouton bouton-discret px-2 py-1 caption-4"
                    onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: s.plages.creneaux.filter((_, j) => j !== i) } }))}
                  >
                    Retirer
                  </button>
                )}
              </div>
            ))}
            {r.plages.creneaux.length < 6 && (
              <button
                type="button"
                className="bouton bouton-discret self-start px-2 py-1 caption-3 text-action"
                onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: [...s.plages.creneaux, { debut: "14:00", fin: "17:00" }] } }))}
              >
                + Ajouter un créneau
              </button>
            )}
          </div>
        </Groupe>

        <Groupe titre="Délai entre deux actions" aide="Tiré au hasard entre ces bornes, en minutes.">
          <label className="flex items-center gap-2 caption-4 text-encre-2">
            Entre
            <Compteur valeur={Math.round(r.delaiMinS / 60)} min={1} max={60} libelle="Délai minimum en minutes" onChange={(v) => setR((s) => ({ ...s, delaiMinS: v * 60 }))} />
          </label>
          <label className="flex items-center gap-2 caption-4 text-encre-2">
            et
            <Compteur valeur={Math.round(r.delaiMaxS / 60)} min={1} max={120} libelle="Délai maximum en minutes" onChange={(v) => setR((s) => ({ ...s, delaiMaxS: v * 60 }))} />
            min
          </label>
        </Groupe>

        <Groupe titre="Cadence de relances" aide="En jours, sans réponse du prospect.">
          <label className="flex items-center gap-2 caption-4 text-encre-2">
            Relance 1
            <Compteur valeur={r.cadence.relance_1_jours} min={1} max={60} libelle="Jours avant la relance 1" onChange={(v) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_1_jours: v } }))} />
          </label>
          <label className="flex items-center gap-2 caption-4 text-encre-2">
            Relance 2
            <Compteur valeur={r.cadence.relance_2_jours} min={1} max={60} libelle="Jours entre relance 1 et relance 2" onChange={(v) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_2_jours: v } }))} />
          </label>
        </Groupe>
      </Section>
    </form>
  );
}
