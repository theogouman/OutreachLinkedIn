import { Suspense } from "react";
import Link from "next/link";
import { BadgeEtape } from "@/components/badges";
import { FilMessages } from "@/components/fil-messages";
import { Avatar, EnTetePage, EtatVide } from "@/components/interface/elements";
import { IconeMessage } from "@/components/icones";
import { etatOutil, ficheProspect, fil, inbox, referentiels } from "@/server/donnees";
import { filtresInboxDepuisUrl } from "@/lib/filtres/inbox";
import { ModaleFiche } from "../fiche";
import { ListeConversations } from "./liste-conversations";
import { MarquerLue } from "./marquer-lue";
import { ActionsConversation } from "./actions-conversation";
import { BoutonNouveauMessage } from "./nouveau-message";
import { InboxGlissante, RetourListe } from "./inbox-glissante";
import { CarteInterlocuteur } from "./carte-interlocuteur";
import { RedactionMessage } from "@/components/redaction-message";

export default function PageInbox({ searchParams }: PageProps<"/inbox">) {
  return (
    <section className="flex flex-col gap-6">
      <EnTetePage
        titre="Inbox"
        description="Toutes les conversations LinkedIn, reliées aux fiches prospects quand elles existent"
        actions={<BoutonNouveauMessage />}
      />
      <Suspense fallback={<SqueletteInbox />}>
        <Contenu searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function SqueletteInbox() {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]" aria-busy="true" aria-label="Chargement">
      <div className="carte flex flex-col">
        <div className="h-12 border-b border-trait" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 border-b border-trait px-4 py-3 last:border-0">
            <span className="squelette size-9 rounded-full" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="squelette h-3 w-32" />
              <span className="squelette h-3 w-48" />
            </span>
          </div>
        ))}
      </div>
      <div className="carte hidden min-h-[60vh] lg:block" />
    </div>
  );
}

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Contenu({ searchParams }: { searchParams: PageProps<"/inbox">["searchParams"] }) {
  const sp = await searchParams;
  // Lien direct (?filtre=a_traiter…) : appliqué au chargement, puis les filtres vivent dans la liste.
  const filtresInitiaux = filtresInboxDepuisUrl(premier(sp.filtre));
  const idFiche = premier(sp.prospect);
  const [initial, refs, etat, fiche] = await Promise.all([
    inbox(filtresInitiaux),
    referentiels(),
    etatOutil(),
    idFiche ? ficheProspect(idFiche) : null,
  ]);
  const idDemande = premier(sp.conversation);
  // Grand écran : la plus récente est ouverte par défaut. Téléphone : la liste d'abord.
  const idOuvert = idDemande ?? initial.lignes[0]?.id;
  const [filOuvert, conversationFiche] = await Promise.all([
    idOuvert ? fil({ conversationId: idOuvert }) : null,
    fiche ? fil({ prospectId: fiche.id }) : null,
  ]);
  // Conversation ouverte : toujours une vraie conversation (id connu).
  const ouvert = filOuvert?.id ? { ...filOuvert, id: filOuvert.id } : null;
  const libelleEtape = new Map(refs.etapes.map((e) => [e.code, e.libelle]));
  const restants = Math.max(0, (etat.quotas.message.plafond.jour ?? 0) - etat.quotas.message.compteur.jour);
  const etapeOuvert = ouvert?.prospectId ? (initial.lignes.find((x) => x.id === ouvert.id)?.etape ?? null) : null;

  return (
    <>
      <InboxGlissante
        idOuverte={ouvert?.id ?? null}
        ouverteExplicitement={!!idDemande && !!ouvert}
        liste={<ListeConversations initial={initial} filtresInitiaux={filtresInitiaux} ouverte={ouvert?.id ?? null} />}
        conversation={
      <div className="carte flex flex-col overflow-hidden">
        {ouvert ? (
          <>
            <MarquerLue id={ouvert.id} nonLu={ouvert.nonLu} />
            <header className="inbox-entete-conversation flex items-center justify-between gap-3 border-b border-trait px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <RetourListe />
                {ouvert.prospectId ? (
                  // Photo, nom et poste ouvrent la fiche par-dessus la conversation, sans quitter l'Inbox.
                  <Link
                    href={`/inbox?${new URLSearchParams({ conversation: ouvert.id, prospect: ouvert.prospectId })}`}
                    scroll={false}
                    aria-label={`Ouvrir la fiche de ${ouvert.nom}`}
                    className="group -mx-1 flex min-w-0 items-center gap-3 rounded-2xl px-1 py-0.5 outline-none transition-colors duration-150 hover:bg-creux focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Avatar nom={ouvert.nom} taille={40} photo={ouvert.photo} />
                    <span className="min-w-0 pr-2">
                      <h2 className="truncate title-3 text-encre underline-offset-2 group-hover:underline">{ouvert.nom}</h2>
                      {ouvert.sousTitre && <span className="block truncate caption-5 text-encre-3">{ouvert.sousTitre}</span>}
                    </span>
                  </Link>
                ) : (
                  // Hors CRM : nom et photo ouvrent sa carte d'infos (sans l'ajouter au CRM).
                  <Link
                    href={`/inbox?${new URLSearchParams({ conversation: ouvert.id, interlocuteur: "1" })}`}
                    scroll={false}
                    aria-label={`Voir la carte de ${ouvert.nom}`}
                    className="group -mx-1 flex min-w-0 items-center gap-3 rounded-2xl px-1 py-0.5 outline-none transition-colors duration-150 hover:bg-creux focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Avatar nom={ouvert.nom} taille={40} photo={ouvert.photo} />
                    <span className="min-w-0 pr-2">
                      <h2 className="truncate title-3 text-encre underline-offset-2 group-hover:underline">{ouvert.nom}</h2>
                      {ouvert.sousTitre && <span className="block truncate caption-5 text-encre-3">{ouvert.sousTitre}</span>}
                    </span>
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {ouvert.prospectId ? (
                  etapeOuvert && <BadgeEtape libelle={libelleEtape.get(etapeOuvert) ?? etapeOuvert} />
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-400/15 px-2.5 py-1 caption-4 text-amber-800 dark:text-amber-300">Hors CRM</span>
                )}
                <ActionsConversation key={ouvert.id} id={ouvert.id} nonLu={ouvert.nonLu} nom={ouvert.nom} />
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-carte px-5 py-5">
              <FilMessages messages={ouvert.messages} nom={ouvert.nom} photo={ouvert.photo} />
            </div>
            <footer className="border-t border-trait px-4 py-3">
              <RedactionMessage
                key={ouvert.id}
                cible={{ conversationId: ouvert.id }}
                destinataire={ouvert.nom}
                restants={restants}
                bloque={etat.modeSimule && !ouvert.demo ? "Unipile n'est pas encore branché : seules les conversations de démonstration peuvent recevoir un message" : undefined}
              />
            </footer>
          </>
        ) : (
          <EtatVide icone={<IconeMessage taille={20} />} titre="Aucune conversation ouverte" texte="Choisis une conversation dans la liste" />
        )}
      </div>
        }
      />

      {ouvert && !ouvert.prospectId && premier(sp.interlocuteur) === "1" && (
        <CarteInterlocuteur
          nom={ouvert.nom}
          titre={ouvert.sousTitre}
          photo={ouvert.photo}
          lienLinkedIn={ouvert.lienLinkedIn}
          identifie={!!ouvert.lienLinkedIn}
        />
      )}
      {fiche && (
        <ModaleFiche
          fiche={fiche}
          libelleEtape={libelleEtape.get(fiche.etape) ?? fiche.etape}
          conversation={conversationFiche}
          restants={restants}
          modeSimule={etat.modeSimule}
        />
      )}
    </>
  );
}
