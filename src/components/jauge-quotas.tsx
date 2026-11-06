import type { EtatOutil } from "@/server/donnees";
import { LIBELLES_QUOTA, TYPES_QUOTA } from "@/lib/plafonds";
import { Jauge } from "./interface/jauge";

const ETAT_FILE = {
  en_cours: { libelle: "File active", classe: "bg-emerald-500" },
  en_pause: { libelle: "File en pause", classe: "bg-neutral-400" },
  gele: { libelle: "Action gelée", classe: "bg-amber-500" },
} as const;

const UNITE = { jour: "j", semaine: "sem.", mois: "mois" } as const;

/** Jauge de quotas toujours visible : consommé / plafond sur la période la plus courte. */
export function JaugeQuotas({ etat }: { etat: EtatOutil }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700">
        <span className={`h-2 w-2 rounded-full ${ETAT_FILE[etat.etatFile].classe}`} aria-hidden />
        {ETAT_FILE[etat.etatFile].libelle}
        {etat.enAttente > 0 && <span className="text-neutral-500">· {etat.enAttente} en attente</span>}
        {etat.incertaines > 0 && <span className="text-amber-700">· {etat.incertaines} à vérifier</span>}
      </span>
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
  );
}
