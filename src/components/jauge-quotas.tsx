import type { EtatOutil } from "@/server/donnees";
import { LIBELLES_QUOTA, TYPES_QUOTA } from "@/lib/plafonds";
import { Jauge } from "./interface/jauge";

export const ETAT_FILE = {
  en_cours: { libelle: "File active", point: "bg-emerald-500", halo: "bg-emerald-500/30" },
  en_pause: { libelle: "File en pause", point: "bg-encre-3", halo: "" },
  gele: { libelle: "Action gelée 24 h", point: "bg-amber-500", halo: "bg-amber-500/30" },
} as const;

const UNITE = { jour: "j", semaine: "sem.", mois: "mois" } as const;

/** État de la file et jauges de quotas (menu Statuts de la barre de navigation). */
export function JaugeQuotas({ etat }: { etat: EtatOutil }) {
  const f = ETAT_FILE[etat.etatFile];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5" aria-hidden>
          {f.halo && <span className={`absolute inline-flex size-full animate-ping rounded-full ${f.halo}`} />}
          <span className={`relative inline-flex size-2.5 rounded-full ${f.point}`} />
        </span>
        <div className="leading-tight">
          <p className="title-4 text-encre">{f.libelle}</p>
          <p className="caption-5 text-encre-3">
            {etat.enAttente} en attente
            {etat.incertaines > 0 && <span className="text-amber-700 dark:text-amber-300"> · {etat.incertaines} à vérifier</span>}
          </p>
        </div>
      </div>
      <div className="h-px bg-trait" aria-hidden />
      <div className="grid grid-cols-1 gap-y-3">
        {TYPES_QUOTA.map((t) => {
          const q = etat.quotas[t];
          const periode = q.plafond.jour !== null ? "jour" : q.plafond.semaine !== null ? "semaine" : "mois";
          return (
            <Jauge
              key={t}
              libelle={LIBELLES_QUOTA[t]}
              valeur={q.compteur[periode]}
              max={q.plafond[periode] ?? 0}
              unite={UNITE[periode]}
              gele={q.gele}
            />
          );
        })}
      </div>
    </div>
  );
}
