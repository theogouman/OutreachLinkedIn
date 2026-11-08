"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Panneau } from "@/components/interface/panneau";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import type { FicheProspect, MessageFil } from "@/server/donnees";
import { FilMessages } from "@/components/fil-messages";
import Link from "next/link";
import { Avatar } from "@/components/interface/elements";
import { LogoLinkedIn } from "@/components/logos";
import { lienProfilLinkedIn } from "@/lib/linkedin-url";

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
export function PanneauFiche({
  fiche,
  libelleEtape,
  conversation,
}: {
  fiche: FicheProspect;
  libelleEtape: string;
  conversation: { id: string; messages: MessageFil[] } | null;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const fermer = () => {
    const q = new URLSearchParams(params);
    q.delete("prospect");
    router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
  };
  const nom = [fiche.prenom, fiche.nom].filter(Boolean).join(" ") || "Prospect";
  const lienProfil = lienProfilLinkedIn(fiche.linkedinUrl);

  return (
    <Panneau ouvert fermer={fermer} titre={nom} description={[fiche.poste, fiche.entreprise].filter(Boolean).join(" · ") || undefined}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar nom={nom} taille={48} />
          <div className="flex flex-wrap gap-2">
            <BadgeStatut statut={fiche.statutRelation} />
            <BadgeEtape libelle={libelleEtape} />
          </div>
        </div>
        {lienProfil && (
          <a href={lienProfil} target="_blank" rel="noopener noreferrer" className="bouton bouton-contour self-start">
            <LogoLinkedIn taille={18} />
            Ouvrir son LinkedIn
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        )}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-trait ring-1 ring-trait">
          {[
            { t: "Liste d'origine", d: fiche.listeOrigine ?? "Aucune" },
            { t: "Prochaine relance", d: fiche.prochaineRelance ?? "Non planifiée" },
            { t: "Identifiant LinkedIn", d: fiche.identifie ? "Lu" : "Lecture en file", large: true },
          ].map((x) => (
            <div key={x.t} className={`flex min-w-0 flex-col gap-0.5 bg-carte px-3 py-2.5 ${x.large ? "col-span-2" : ""}`}>
              <dt className="caption-4 text-encre-3">{x.t}</dt>
              <dd className="truncate body-6 text-encre">{x.d}</dd>
            </div>
          ))}
        </dl>
        {fiche.notes && (
          <section className="flex flex-col gap-2">
            <h3 className="caption-3 uppercase tracking-wide text-encre-3">Notes</h3>
            <p className="selectionnable whitespace-pre-wrap rounded-xl bg-creux px-3 py-2.5 body-6 text-encre-2">{fiche.notes}</p>
          </section>
        )}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="caption-3 uppercase tracking-wide text-encre-3">Conversation LinkedIn</h3>
            {conversation && (
              <Link href={`/inbox?conversation=${conversation.id}`} className="bouton bouton-discret px-2 py-1 caption-3 text-accent">
                Ouvrir dans l&apos;Inbox
              </Link>
            )}
          </div>
          {conversation ? (
            <div className="rounded-xl bg-creux p-3">
              <FilMessages messages={conversation.messages} nom={nom} />
            </div>
          ) : (
            <p className="caption-5 text-encre-3">Aucune conversation pour l&apos;instant.</p>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="caption-3 uppercase tracking-wide text-encre-3">Historique</h3>
          {fiche.historique.length === 0 ? (
            <p className="caption-5 text-encre-3">Aucun événement.</p>
          ) : (
            <ol className="relative ml-1 flex flex-col gap-4 border-l border-trait pl-5">
              {fiche.historique.map((e, i) => (
                <li key={i} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[25.5px] top-1 size-2.5 rounded-full ring-4 ring-carte ${e.enFile ? "bg-trait-fort" : e.resultat === "succes" ? "bg-accent" : "bg-amber-400"}`}
                  />
                  <p className="title-4 text-encre">
                    {EVENEMENTS[e.type] ?? e.type}
                    <span className="font-normal text-encre-3">{e.enFile ? " · en file" : (RESULTATS[e.resultat ?? ""] ?? "")}</span>
                  </p>
                  <time dateTime={new Date(e.date).toISOString()} className="caption-5 text-encre-3">
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
