import type { ReactNode } from "react";
import { IconeFile, IconeInviter, IconeLecture, IconeMessage, IconeRetirer, IconeSynchro } from "@/components/icones";
import type { LigneTache as Tache } from "@/server/donnees";
import { ActionsTache } from "./actions-tache";

const TYPES: Record<string, { libelle: string; icone: ReactNode }> = {
  invitation: { libelle: "Invitation", icone: <IconeInviter taille={16} /> },
  message: { libelle: "Message", icone: <IconeMessage taille={16} /> },
  lecture_profil: { libelle: "Lecture de profil", icone: <IconeLecture taille={16} /> },
  lecture_liste: { libelle: "Synchronisation", icone: <IconeSynchro taille={16} /> },
  retrait_invitation: { libelle: "Retrait d'invitation", icone: <IconeRetirer taille={16} /> },
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

const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const jourParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/** Départ estimé : heure en avant, jour en dessous (« Aujourd'hui », « Demain » ou la date). */
function depart(d: Date) {
  const cle = (x: Date) => jourParis.format(x);
  const maintenant = new Date();
  const demain = new Date(maintenant.getTime() + 86_400_000);
  const jour = cle(d) === cle(maintenant) ? "Aujourd'hui" : cle(d) === cle(demain) ? "Demain" : fmtJour.format(d);
  return { heure: fmtHeure.format(d), jour };
}

/**
 * Une action de la file, compacte : icône, type et « prospect · motif », départ estimé à droite
 * (heure, puis jour), annulation en croix sur téléphone. Décision à prendre (envoi incertain) :
 * boutons sur une ligne à part.
 */
export function LigneTache({ t }: { t: Tache }) {
  const type = TYPES[t.type] ?? { libelle: t.type, icone: <IconeFile taille={16} /> };
  const incertaine = t.statut === "incertaine";
  return (
    <li
      className={`flex animate-apparition flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6 ${incertaine ? "bg-amber-50/50 dark:bg-amber-400/10" : ""}`}
    >
      <span className="hidden w-12 shrink-0 caption-4 tabular-nums text-encre-3 sm:block">{t.ordre}</span>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-creux text-encre-2 ring-1 ring-trait">{type.icone}</span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 title-4 text-encre">
          <span className="truncate">{type.libelle}</span>
          {t.statut === "en_cours" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-400/15 px-2 py-0.5 caption-4 text-emerald-800 dark:text-emerald-300">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              En cours
            </span>
          )}
        </p>
        <p className="truncate caption-5 text-encre-3">
          {t.prospect ?? "Sans prospect"}
          {/* Motif d'attente seulement s'il apprend quelque chose (quota, délai, gel…). */}
          {t.motif && (
            <>
              <span aria-hidden> · </span>
              <span className={incertaine ? "text-amber-800 dark:text-amber-300" : ""}>{MOTIFS[t.motif] ?? t.motif}</span>
            </>
          )}
        </p>
        {t.derniereErreur && <p className="truncate caption-5 text-encre-3">{t.derniereErreur}</p>}
      </div>
      {incertaine ? (
        <span className="shrink-0 text-right caption-4 text-amber-800 dark:text-amber-300">À vérifier</span>
      ) : (
        (() => {
          const d = depart(t.departEstime ?? t.executerApres);
          return (
            <span className="flex shrink-0 flex-col items-end leading-tight">
              <span className="title-4 tabular-nums text-encre">{d.heure}</span>
              <span className="caption-5 text-encre-3">{d.jour}</span>
            </span>
          );
        })()
      )}
      <ActionsTache id={t.id} statut={t.statut} />
    </li>
  );
}
