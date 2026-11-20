import { Suspense } from "react";
import { fileAttente } from "@/server/donnees";
import { EnTetePage, EtatVide, SqueletteLignes } from "@/components/interface/elements";
import { IconeAlerte, IconeFile } from "@/components/icones";
import { LigneTache } from "./ligne-tache";

export default function PageFile() {
  return (
    <section className="flex flex-col gap-6">
      <EnTetePage
        titre="File d'attente"
        description="Chaque action LinkedIn part dans l'ordre de demande, sous les quotas et dans les plages horaires. Rien ne part deux fois."
      />
      <Suspense fallback={<SqueletteLignes lignes={6} />}>
        <Liste />
      </Suspense>
    </section>
  );
}

async function Liste() {
  const taches = await fileAttente();
  if (taches.length === 0) {
    return (
      <EtatVide
        icone={<IconeFile taille={20} />}
        titre="La file est vide"
        texte="Les invitations, messages et synchronisations demandés apparaîtront ici avec leur heure de départ estimée"
      />
    );
  }
  const incertaines = taches.filter((t) => t.statut === "incertaine").length;

  return (
    <div className="flex flex-col gap-4">
      {incertaines > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/15 px-4 py-3 text-amber-900 dark:text-amber-200">
          <IconeAlerte taille={18} className="mt-0.5 shrink-0" />
          <p className="body-6">
            {incertaines === 1 ? "Une action a un envoi incertain" : `${incertaines} actions ont un envoi incertain`} : vérifie sur LinkedIn
            avant de trancher. Elles ne repartiront jamais seules.
          </p>
        </div>
      )}
      <ol className="carte divide-y divide-trait overflow-hidden">
        {taches.map((t) => (
          <LigneTache key={t.id} t={t} />
        ))}
      </ol>
    </div>
  );
}
