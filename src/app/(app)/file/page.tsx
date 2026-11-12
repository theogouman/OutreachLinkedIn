import { Suspense, type ReactNode } from "react";
import { fileAttente } from "@/server/donnees";
import { EnTetePage, EtatVide, SqueletteLignes } from "@/components/interface/elements";
import { IconeAlerte, IconeFile, IconeHorloge, IconeInviter, IconeLecture, IconeMessage, IconeSynchro } from "@/components/icones";
import { ActionsTache } from "./actions-tache";

const TYPES: Record<string, { libelle: string; icone: ReactNode }> = {
  invitation: { libelle: "Invitation", icone: <IconeInviter taille={16} /> },
  message: { libelle: "Message", icone: <IconeMessage taille={16} /> },
  lecture_profil: { libelle: "Lecture de profil", icone: <IconeLecture taille={16} /> },
  lecture_liste: { libelle: "Synchronisation", icone: <IconeSynchro taille={16} /> },
};

const MOTIFS: Record<string, string> = {
  arret_d_urgence: "Arrêt d'urgence",
  aucune_plage: "Aucune plage horaire",
  hors_plage: "Hors plage horaire",
  espacement: "Délai entre deux actions",
  gel: "Action gelée 24 h",
  quota_jour: "Quota du jour atteint",
  quota_semaine: "Quota de la semaine atteint",
  quota_mois: "Quota du mois atteint",
  incertaine: "Envoi incertain : à vérifier",
  interrompue: "Interrompue pendant l'envoi : à vérifier",
};

const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

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
        {taches.map((t) => {
          const type = TYPES[t.type] ?? { libelle: t.type, icone: <IconeFile taille={16} /> };
          const incertaine = t.statut === "incertaine";
          return (
            <li
              key={t.id}
              className={`grid animate-apparition grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] ${incertaine ? "bg-amber-50/50 dark:bg-amber-400/10" : ""}`}
            >
              <span className="caption-4 tabular-nums text-encre-3">{t.ordre}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-creux text-encre-2 ring-1 ring-trait">{type.icone}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 title-4 text-encre">
                    {type.libelle}
                    {t.statut === "en_cours" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-400/15 px-2 py-0.5 caption-4 text-emerald-800 dark:text-emerald-300">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                        En cours
                      </span>
                    )}
                  </p>
                  <p className="truncate caption-5 text-encre-3">{t.prospect ?? "Sans prospect"}</p>
                </div>
              </div>
              <div className="col-start-2 min-w-0 sm:col-start-auto">
                <p className={`caption-4 ${incertaine ? "text-amber-800 dark:text-amber-300" : "text-encre-2"}`}>
                  {t.motif ? (MOTIFS[t.motif] ?? t.motif) : t.statut === "en_attente" ? "Prochain passage" : "—"}
                </p>
                {t.derniereErreur && <p className="truncate caption-5 text-encre-3">{t.derniereErreur}</p>}
              </div>
              <p className="col-start-2 flex items-center gap-1.5 caption-4 text-encre-2 sm:col-start-auto">
                <IconeHorloge taille={16} className="text-encre-3" />
                {incertaine ? "En attente de ta décision" : fmt.format(t.departEstime ?? t.executerApres)}
              </p>
              <div className="col-start-2 sm:col-start-auto">
                <ActionsTache id={t.id} statut={t.statut} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
