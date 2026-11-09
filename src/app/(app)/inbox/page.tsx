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
import { BoutonNouveauMessage } from "./nouveau-message";
import { InboxGlissante, RetourListe } from "./inbox-glissante";
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
            <header className="inbox-entete-conversation flex flex-wrap items-center justify-between gap-3 border-b border-trait px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <RetourListe />
                <Avatar nom={ouvert.nom} taille={40} />
                <div className="min-w-0">
                  <h2 className="truncate title-3 text-encre">{ouvert.nom}</h2>
                  {ouvert.sousTitre && <p className="truncate caption-5 text-encre-3">{ouvert.sousTitre}</p>}
                </div>
              </div>
              {ouvert.prospectId ? (
                <span className="flex items-center gap-3">
                  {etapeOuvert && <BadgeEtape libelle={libelleEtape.get(etapeOuvert) ?? etapeOuvert} />}
                  {/* La fiche s'ouvre par-dessus la conversation, sans quitter l'Inbox. */}
                  <Link
                    href={`/inbox?${new URLSearchParams({ conversation: ouvert.id, prospect: ouvert.prospectId })}`}
                    scroll={false}
                    className="bouton bouton-contour px-3 py-1.5 caption-3"
                  >
                    Voir la fiche
                  </Link>
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 caption-4 text-amber-800">Hors CRM · ajout au CRM en phase 2</span>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-carte px-5 py-5">
              <FilMessages messages={ouvert.messages} nom={ouvert.nom} />
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
