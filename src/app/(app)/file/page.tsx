import { Suspense } from "react";
import { fileAttente } from "@/server/donnees";
import { ActionsTache } from "./actions-tache";

const TYPES: Record<string, string> = {
  invitation: "Invitation",
  message: "Message",
  lecture_profil: "Lecture de profil",
  lecture_liste: "Synchronisation",
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

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export default function PageFile() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">File d&apos;attente</h1>
        <p className="text-sm text-neutral-600">
          Chaque action LinkedIn part dans l&apos;ordre de demande, sous les quotas et dans les plages horaires.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <Liste />
      </Suspense>
    </section>
  );
}

async function Liste() {
  const taches = await fileAttente();
  if (taches.length === 0) {
    return <div className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">La file est vide.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Prospect</th>
            <th className="px-4 py-3 font-medium">Attente</th>
            <th className="px-4 py-3 font-medium">Départ estimé</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {taches.map((t) => (
            <tr key={t.id} className={t.statut === "incertaine" ? "bg-amber-50/60" : undefined}>
              <td className="px-4 py-3 text-neutral-400">{t.ordre}</td>
              <td className="px-4 py-3">
                {TYPES[t.type] ?? t.type}
                {t.statut === "en_cours" && <span className="ml-2 text-xs text-emerald-700">en cours</span>}
              </td>
              <td className="px-4 py-3 text-neutral-700">{t.prospect ?? "—"}</td>
              <td className="px-4 py-3 text-neutral-600">
                {t.motif ? (MOTIFS[t.motif] ?? t.motif) : t.statut === "en_attente" ? "Prochain passage" : "—"}
                {t.derniereErreur && <span className="block text-xs text-neutral-400">{t.derniereErreur}</span>}
              </td>
              <td className="px-4 py-3 text-neutral-600">
                {t.statut === "incertaine" ? "—" : fmt.format(t.departEstime ?? t.executerApres)}
              </td>
              <td className="px-4 py-3">
                <ActionsTache id={t.id} statut={t.statut} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
