"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Panneau } from "@/components/interface/panneau";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import type { FicheProspect } from "@/server/donnees";

const EVENEMENTS: Record<string, string> = {
  invitation: "Invitation",
  message: "Message",
  lecture_profil: "Lecture du profil",
  lecture_liste: "Synchronisation",
  acceptation: "Invitation acceptée",
  reponse: "Réponse reçue",
  changement_etape: "Changement d'étape",
};
const RESULTATS: Record<string, string> = { succes: "", echec: " · échec", incertain: " · à vérifier", en_cours: " · en cours" };
const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

/** Fiche en panneau latéral, ouverte par ?prospect=<id> (lien direct possible). */
export function PanneauFiche({ fiche, libelleEtape }: { fiche: FicheProspect; libelleEtape: string }) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const fermer = () => {
    const q = new URLSearchParams(params);
    q.delete("prospect");
    router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
  };
  const nom = [fiche.prenom, fiche.nom].filter(Boolean).join(" ") || "Prospect";

  return (
    <Panneau ouvert fermer={fermer} titre={nom} description={[fiche.poste, fiche.entreprise].filter(Boolean).join(" · ") || undefined}>
      <div className="flex flex-col gap-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <BadgeStatut statut={fiche.statutRelation} />
          <BadgeEtape libelle={libelleEtape} />
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
          <dt className="text-neutral-500">Profil</dt>
          <dd className="truncate">
            {/* Lien affiché seulement : l'ouvrir compte comme une visite de profil sur LinkedIn. */}
            <span className="text-neutral-700">{fiche.linkedinUrl.replace(/^https:\/\/(www\.)?/, "")}</span>
          </dd>
          <dt className="text-neutral-500">Liste d&apos;origine</dt>
          <dd>{fiche.listeOrigine ?? "—"}</dd>
          <dt className="text-neutral-500">Prochaine relance</dt>
          <dd>{fiche.prochaineRelance ?? "—"}</dd>
          <dt className="text-neutral-500">Identifiant LinkedIn</dt>
          <dd>{fiche.identifie ? "Lu" : "Lecture en file"}</dd>
        </dl>
        {fiche.notes && (
          <section>
            <h3 className="mb-1 font-medium">Notes</h3>
            <p className="whitespace-pre-wrap text-neutral-700">{fiche.notes}</p>
          </section>
        )}
        <section>
          <h3 className="mb-2 font-medium">Historique</h3>
          {fiche.historique.length === 0 ? (
            <p className="text-neutral-500">Aucun événement.</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-neutral-200 pl-4">
              {fiche.historique.map((e, i) => (
                <li key={i} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${e.enFile ? "bg-neutral-300" : e.resultat === "succes" ? "bg-[#e0625a]" : "bg-amber-400"}`}
                  />
                  <p className="text-neutral-800">
                    {EVENEMENTS[e.type] ?? e.type}
                    {e.enFile ? " · en file" : (RESULTATS[e.resultat ?? ""] ?? "")}
                  </p>
                  <time dateTime={new Date(e.date).toISOString()} className="text-xs text-neutral-500">
                    {e.enFile ? "Départ estimé " : ""}
                    {fmt.format(new Date(e.date))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Panneau>
  );
}
