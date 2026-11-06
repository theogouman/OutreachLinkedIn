"use client";

import { useState, useTransition } from "react";
import { actionPlafonds, actionReglages } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { LIBELLES_QUOTA, MAXIMA, TYPES_QUOTA, type TypeQuota } from "@/lib/plafonds";

type Plafonds = Record<TypeQuota, { jour: number | null; semaine: number | null; mois: number | null }>;
type Reglages = {
  plages: { jours: number[]; creneaux: { debut: string; fin: string }[] };
  delaiMinS: number;
  delaiMaxS: number;
  cadence: { relance_1_jours: number; relance_2_jours: number };
};

const carte = "flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm";
const champ = "w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";
const bouton = "self-start rounded-lg bg-[#b5443d] px-4 py-2 text-sm font-medium text-white hover:bg-[#9c3a34] disabled:opacity-60";
const PERIODES = ["jour", "semaine", "mois"] as const;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function FormPlafonds({ initial }: { initial: Plafonds }) {
  const [valeurs, setValeurs] = useState(initial);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();

  return (
    <form className={carte} action={() => demarrer(async () => retourner(await actionPlafonds(valeurs)))}>
      <div>
        <h2 className="font-semibold">Plafonds (compte LinkedIn gratuit)</h2>
        <p className="text-sm text-neutral-600">Jamais au-dessus de la recommandation Unipile, indiquée en gris.</p>
      </div>
      <table className="text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-2 font-medium">Action</th>
            {PERIODES.map((p) => <th key={p} className="py-2 font-medium">Par {p}</th>)}
          </tr>
        </thead>
        <tbody>
          {TYPES_QUOTA.map((t) => (
            <tr key={t}>
              <td className="py-1.5 pr-4">{LIBELLES_QUOTA[t]}</td>
              {PERIODES.map((p) => {
                const max = MAXIMA[t][p];
                return (
                  <td key={p} className="py-1.5 pr-4">
                    {max === null ? (
                      <span className="text-neutral-300">—</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          required
                          className={champ}
                          value={valeurs[t][p] ?? 0}
                          onChange={(e) =>
                            setValeurs((v) => ({ ...v, [t]: { ...v[t], [p]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) } }))
                          }
                          aria-label={`${LIBELLES_QUOTA[t]} par ${p}`}
                        />
                        <span className="text-xs text-neutral-400">max {max}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="submit" disabled={enCours} className={bouton}>Enregistrer les plafonds</button>
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
    <form className={carte} action={() => demarrer(async () => retourner(await actionReglages(r)))}>
      <h2 className="font-semibold">Rythme d&apos;activité</h2>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-neutral-600">Jours actifs (heure de Paris)</legend>
        <div className="flex flex-wrap gap-2">
          {JOURS.map((j, i) => {
            const n = i + 1;
            const actif = r.plages.jours.includes(n);
            return (
              <label key={j} className={`cursor-pointer rounded-lg px-3 py-1.5 ring-1 ring-inset ${actif ? "bg-[#e0625a]/10 text-[#b3403a] ring-[#e0625a]/40" : "text-neutral-600 ring-neutral-300"}`}>
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
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-neutral-600">Créneaux</legend>
        {r.plages.creneaux.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="time" required value={c.debut} onChange={(e) => majCreneau(i, "debut", e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5" />
            <span>→</span>
            <input type="time" required value={c.fin} onChange={(e) => majCreneau(i, "fin", e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5" />
            {r.plages.creneaux.length > 1 && (
              <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: s.plages.creneaux.filter((_, j) => j !== i) } }))}>
                Retirer
              </button>
            )}
          </div>
        ))}
        {r.plages.creneaux.length < 6 && (
          <button type="button" className="self-start text-xs text-[#b3403a] hover:underline" onClick={() => setR((s) => ({ ...s, plages: { ...s.plages, creneaux: [...s.plages.creneaux, { debut: "14:00", fin: "17:00" }] } }))}>
            + Ajouter un créneau
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1 text-neutral-600">Délai aléatoire entre deux actions LinkedIn (minutes)</legend>
        <label className="flex items-center gap-2">min
          <input type="number" min={1} max={60} required className={champ} value={r.delaiMinS / 60} onChange={(e) => setR((s) => ({ ...s, delaiMinS: Math.round(Number(e.target.value) * 60) }))} />
        </label>
        <label className="flex items-center gap-2">max
          <input type="number" min={1} max={120} required className={champ} value={r.delaiMaxS / 60} onChange={(e) => setR((s) => ({ ...s, delaiMaxS: Math.round(Number(e.target.value) * 60) }))} />
        </label>
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1 text-neutral-600">Cadence de relances (jours)</legend>
        <label className="flex items-center gap-2">Relance 1 après le premier message
          <input type="number" min={1} max={60} required className={champ} value={r.cadence.relance_1_jours} onChange={(e) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_1_jours: Number(e.target.value) } }))} />
        </label>
        <label className="flex items-center gap-2">Relance 2 après la relance 1
          <input type="number" min={1} max={60} required className={champ} value={r.cadence.relance_2_jours} onChange={(e) => setR((s) => ({ ...s, cadence: { ...s.cadence, relance_2_jours: Number(e.target.value) } }))} />
        </label>
      </fieldset>

      <button type="submit" disabled={enCours} className={bouton}>Enregistrer</button>
    </form>
  );
}
