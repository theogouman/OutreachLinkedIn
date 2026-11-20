import { IconeAlerte } from "@/components/icones";
import type { LigneTache as Tache } from "@/server/donnees";
import { LigneTache } from "./ligne-tache";

/** Contenu du réglage « File d'attente » : envois incertains d'abord, puis l'ordre de départ. */
export function ContenuFile({ taches }: { taches: Tache[] }) {
  if (taches.length === 0) {
    return (
      <p className="px-5 pb-6 pt-4 body-6 text-encre-3 sm:px-6">
        La file est vide. Les invitations, messages et synchronisations demandés apparaîtront ici avec leur heure de départ estimée.
      </p>
    );
  }
  const incertaines = taches.filter((t) => t.statut === "incertaine").length;

  return (
    <div className="flex flex-col gap-3 pt-4">
      {incertaines > 0 && (
        <div
          role="status"
          className="mx-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:mx-6 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200"
        >
          <IconeAlerte taille={18} className="mt-0.5 shrink-0" />
          <p className="body-6">
            {incertaines === 1 ? "Une action a un envoi incertain" : `${incertaines} actions ont un envoi incertain`} : vérifie sur LinkedIn
            avant de trancher. Elles ne repartiront jamais seules.
          </p>
        </div>
      )}
      <ol className="divide-y divide-trait border-t border-trait">
        {taches.map((t) => (
          <LigneTache key={t.id} t={t} />
        ))}
      </ol>
    </div>
  );
}
