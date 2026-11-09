"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modale, useModale } from "@/components/interface/modale";
import { SectionsGlissantes } from "@/components/interface/sections-glissantes";
import { IconeFermer, IconeLienExterne } from "@/components/icones";
import { BadgeEtape, BadgeStatut } from "@/components/badges";
import type { FicheProspect, MessageFil } from "@/server/donnees";
import { FilMessages } from "@/components/fil-messages";
import { RedactionMessage } from "@/components/redaction-message";
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
const RESULTATS: Record<string, string> = {
  succes: "",
  echec: " · échec",
  incertain: " · à vérifier",
  en_cours: " · en cours",
};
const fmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

const fmtJour = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

function jourRelance(date: string | null) {
  if (!date) return "Non planifiée";
  const j = fmtJour.format(new Date(`${date}T12:00:00Z`));
  return j.charAt(0).toUpperCase() + j.slice(1);
}

/** Fiche prospect en modale centrée, ouverte par ?prospect=<id> (lien direct possible). */
export function ModaleFiche({
  fiche,
  libelleEtape,
  conversation,
  restants,
  modeSimule,
}: {
  fiche: FicheProspect;
  libelleEtape: string;
  conversation: { id: string; demo: boolean; messages: MessageFil[] } | null;
  /** Messages encore possibles aujourd'hui (quota du jour). */
  restants: number;
  modeSimule: boolean;
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

  return (
    // Taille fixe : une longue conversation défile dans son encadré, la modale ne bouge pas.
    <Modale fermer={fermer} hauteurFixe enTete={<EnTeteFiche fiche={fiche} nom={nom} />}>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-1 sm:px-8 sm:pb-8">
        <SectionsGlissantes
          remplir
          libelle="Fiche du prospect"
          sections={[
            {
              id: "informations",
              libelle: "Informations",
              contenu: (
                <div className="flex flex-col gap-6">
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-trait ring-1 ring-trait sm:grid-cols-3">
                    {[
                      {
                        t: "Relation",
                        d: <BadgeStatut statut={fiche.statutRelation} />,
                      },
                      { t: "Étape", d: <BadgeEtape libelle={libelleEtape} /> },
                      {
                        t: "Prochaine relance",
                        d: jourRelance(fiche.prochaineRelance),
                      },
                      {
                        t: "Liste d'origine",
                        d: fiche.listeOrigine ?? "Aucune",
                      },
                      { t: "Entreprise", d: fiche.entreprise ?? "Inconnue" },
                      {
                        t: "Identifiant LinkedIn",
                        d: fiche.identifie ? "Lu" : "Lecture en file",
                      },
                    ].map((x, i) => (
                      <div
                        key={x.t}
                        className={`flex min-w-0 flex-col gap-1.5 bg-carte px-4 py-3 ${i === 0 || i === 5 ? "col-span-2 sm:col-span-1" : ""}`}
                      >
                        <dt className="caption-4 text-encre-3">{x.t}</dt>
                        <dd className="flex min-h-6 items-center body-6 text-encre">
                          {x.d}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {fiche.informationsListe.length > 0 && (
                    <section className="flex flex-col gap-2" aria-label={`Informations de la liste ${fiche.listeOrigine ?? ""}`}>
                      <h3 className="caption-4 text-encre-3">{fiche.listeOrigine}</h3>
                      <dl className="flex flex-col divide-y divide-trait overflow-hidden rounded-2xl ring-1 ring-trait">
                        {fiche.informationsListe.map((info) => (
                          <div key={info.cle} className="flex flex-col gap-1 bg-carte px-4 py-3 sm:flex-row sm:gap-4">
                            <dt className="caption-4 text-encre-3 sm:w-36 sm:shrink-0 sm:pt-0.5">{info.libelle}</dt>
                            <dd className="selectionnable min-w-0 whitespace-pre-wrap break-words body-6 text-encre">
                              {info.type === "lien" ? (
                                <a
                                  href={info.valeur}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-action underline-offset-2 outline-none hover:underline focus-visible:underline"
                                >
                                  <span className="break-all">{new URL(info.valeur).hostname}</span>
                                  <IconeLienExterne taille={11} />
                                  <span className="sr-only"> (nouvel onglet)</span>
                                </a>
                              ) : (
                                info.valeur
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

                  {fiche.notes && (
                    <section className="flex flex-col gap-2" aria-label="Notes">
                      <h3 className="caption-4 text-encre-3">Notes</h3>
                      <p className="selectionnable whitespace-pre-wrap rounded-2xl bg-creux px-4 py-3 body-6 text-encre-2">
                        {fiche.notes}
                      </p>
                    </section>
                  )}
                </div>
              ),
            },
            {
              id: "conversation",
              libelle: "Conversation",
              compte: conversation?.messages.length ?? 0,
              contenu: (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  {conversation ? (
                    <>
                      <FilDefilant nombre={conversation.messages.length}>
                        <FilMessages
                          messages={conversation.messages}
                          nom={nom}
                          surMotif
                        />
                      </FilDefilant>
                      <RedactionMessage
                        conversationId={conversation.id}
                        destinataire={fiche.prenom ?? nom}
                        restants={restants}
                        bloque={modeSimule && !conversation.demo ? "Unipile n'est pas encore branché : seules les conversations de démonstration peuvent recevoir un message" : undefined}
                      />
                      <Link
                        href={`/inbox?conversation=${conversation.id}`}
                        className="bouton bouton-discret shrink-0 self-start px-3 py-1.5 caption-3 text-action"
                      >
                        Ouvrir dans l&apos;Inbox
                      </Link>
                    </>
                  ) : (
                    <p className="rounded-2xl bg-creux px-4 py-6 text-center caption-5 text-encre-3">
                      Pas encore de conversation LinkedIn avec ce prospect : l&apos;écriture s&apos;ouvre dès
                      qu&apos;un premier échange existe
                    </p>
                  )}
                </div>
              ),
            },
            {
              id: "historique",
              libelle: "Historique",
              compte: fiche.historique.length,
              contenu:
                fiche.historique.length === 0 ? (
                  <p className="rounded-2xl bg-creux px-4 py-6 text-center caption-5 text-encre-3">
                    Aucun événement
                  </p>
                ) : (
                  <ol className="relative ml-1 flex flex-col gap-4 border-l border-trait py-1 pl-5">
                    {fiche.historique.map((e, i) => (
                      <li key={i} className="relative">
                        <span
                          aria-hidden
                          className={`absolute -left-[25.5px] top-1 size-2.5 rounded-full ring-4 ring-carte ${e.enFile ? "bg-trait-fort" : e.resultat === "succes" ? "bg-accent" : "bg-amber-400"}`}
                        />
                        <p className="title-4 text-encre">
                          {EVENEMENTS[e.type] ?? e.type}
                          <span className="font-normal text-encre-3">
                            {e.enFile
                              ? " · en file"
                              : (RESULTATS[e.resultat ?? ""] ?? "")}
                          </span>
                        </p>
                        <time
                          dateTime={new Date(e.date).toISOString()}
                          className="caption-5 text-encre-3"
                        >
                          {e.enFile ? "Départ estimé " : ""}
                          {fmt.format(new Date(e.date))}
                        </time>
                      </li>
                    ))}
                  </ol>
                ),
            },
          ]}
        />
      </div>
    </Modale>
  );
}

function EnTeteFiche({ fiche, nom }: { fiche: FicheProspect; nom: string }) {
  const { fermer, titreId } = useModale();
  const lienProfil = lienProfilLinkedIn(fiche.linkedinUrl);
  const sousTitre = [fiche.poste, fiche.entreprise].filter(Boolean).join(" · ");
  return (
    <header className="flex shrink-0 flex-col gap-4 px-6 pb-5 pt-5 sm:px-8 sm:pt-7">
      <div className="flex items-start justify-between gap-4">
        <Avatar nom={nom} taille={56} />
        <button
          type="button"
          onClick={fermer}
          aria-label="Fermer la fiche"
          className="grid size-9 shrink-0 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent"
        >
          <IconeFermer taille={16} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2
          id={titreId}
          className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-encre sm:text-[32px]"
        >
          {nom}
        </h2>
        {(sousTitre || lienProfil) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {sousTitre && <p className="body-6 text-encre-2">{sousTitre}</p>}
            {sousTitre && lienProfil && <span aria-hidden className="h-3.5 w-px bg-trait-fort" />}
            {lienProfil && (
              <a
                href={lienProfil}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 rounded-md caption-3 text-encre-3 outline-none transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-encre focus-visible:text-encre focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LogoLinkedIn taille={14} className="opacity-70 grayscale transition-[filter,opacity] duration-150 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0" />
                <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-px transition-[background-size] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[length:100%_1px]">
                  Ouvrir son LinkedIn
                </span>
                <IconeLienExterne
                  taille={11}
                  className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Encadré du fil : défile seul (la modale garde sa taille) et s'ouvre sur le dernier message. */
function FilDefilant({ nombre, children }: { nombre: number; children: ReactNode }) {
  const zone = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const z = zone.current;
    if (z) z.scrollTop = z.scrollHeight;
  }, [nombre]);
  return (
    <div
      ref={zone}
      tabIndex={0}
      aria-label="Messages"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain fond-conversation rounded-2xl p-4 ring-1 ring-inset ring-trait outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </div>
  );
}
