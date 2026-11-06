import type { EtatOutil } from "@/server/donnees";
import { LIBELLES_QUOTA, TYPES_QUOTA } from "@/lib/plafonds";

const ETAT_FILE = {
  en_cours: { libelle: "File active", classe: "bg-emerald-500" },
  en_pause: { libelle: "File en pause", classe: "bg-neutral-400" },
  gele: { libelle: "Action gelée", classe: "bg-amber-500" },
} as const;

/** Jauge de quotas toujours visible : consommé / plafond sur la période la plus contraignante. */
export function JaugeQuotas({ etat }: { etat: EtatOutil }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium text-neutral-700">
        <span className={`h-2 w-2 rounded-full ${ETAT_FILE[etat.etatFile].classe}`} aria-hidden />
        {ETAT_FILE[etat.etatFile].libelle}
        {etat.enAttente > 0 && <span className="text-neutral-500">· {etat.enAttente} en attente</span>}
        {etat.incertaines > 0 && <span className="text-amber-700">· {etat.incertaines} à vérifier</span>}
      </span>
      {TYPES_QUOTA.map((t) => {
        const q = etat.quotas[t];
        const periode = q.plafond.jour !== null ? "jour" : q.plafond.semaine !== null ? "semaine" : "mois";
        const plafond = q.plafond[periode] ?? 0;
        const conso = q.compteur[periode];
        const ratio = plafond > 0 ? Math.min(conso / plafond, 1) : 1;
        const gele = q.gele;
        return (
          <div key={t} className="flex min-w-[8.5rem] flex-col gap-1" title={gele ? `Gelé jusqu'au ${q.gelJusqua!.toLocaleString("fr-FR")}` : undefined}>
            <div className="flex justify-between gap-2 text-neutral-600">
              <span>{LIBELLES_QUOTA[t]}</span>
              <span className={gele ? "text-amber-700" : ratio >= 1 ? "text-[#b3403a]" : "text-neutral-800"}>
                {gele ? "gelé" : `${conso}/${plafond} ${periode === "jour" ? "j" : periode === "semaine" ? "sem." : "mois"}`}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-neutral-200"
              role="meter"
              aria-label={LIBELLES_QUOTA[t]}
              aria-valuemin={0}
              aria-valuemax={plafond}
              aria-valuenow={conso}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${gele ? "bg-amber-400" : ratio >= 1 ? "bg-[#b3403a]" : "bg-[#e0625a]"}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
