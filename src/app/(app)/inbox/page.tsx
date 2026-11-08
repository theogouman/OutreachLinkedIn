import { Suspense } from "react";
import Link from "next/link";
import { BadgeEtape } from "@/components/badges";
import { FilMessages } from "@/components/fil-messages";
import { Avatar, EtatVide } from "@/components/interface/elements";
import { IconeEnvoyer, IconeInbox, IconeMessage } from "@/components/icones";
import { etatOutil, fil, filtreInboxSchema, inbox, referentiels, type FiltreInbox } from "@/server/donnees";
import { MarquerLue } from "./marquer-lue";

const FILTRES: { cle: FiltreInbox; libelle: string }[] = [
  { cle: "tous", libelle: "Toutes" },
  { cle: "non_lus", libelle: "Non lues" },
  { cle: "a_traiter", libelle: "À traiter" },
  { cle: "hors_crm", libelle: "Hors CRM" },
];

const fmtJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const fmtCle = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

function quand(iso: Date | string, aujourdhui: string) {
  const d = new Date(iso);
  return fmtCle.format(d) === aujourdhui ? fmtHeure.format(d) : fmtJour.format(d);
}

export default function PageInbox({ searchParams }: PageProps<"/inbox">) {
  return (
    <section className="flex flex-1 flex-col">
      <Suspense fallback={<SqueletteInbox />}>
        <Contenu searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function SqueletteInbox() {
  return (
    <div className="grid lg:grid-cols-[340px_1fr]" aria-busy="true" aria-label="Chargement">
      <div className="flex flex-col border-trait lg:border-r">
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
      <div className="hidden min-h-[60vh] lg:block" />
    </div>
  );
}

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Contenu({ searchParams }: { searchParams: PageProps<"/inbox">["searchParams"] }) {
  const sp = await searchParams;
  const filtre = filtreInboxSchema.parse(premier(sp.filtre) ?? "tous");
  const [conversations, refs, etat] = await Promise.all([inbox(filtre), referentiels(), etatOutil()]);
  const idOuvert = premier(sp.conversation) ?? conversations[0]?.id;
  const ouvert = idOuvert ? await fil({ conversationId: idOuvert }) : null;
  const libelleEtape = new Map(refs.etapes.map((e) => [e.code, e.libelle]));
  const lien = (q: Record<string, string>) => `/inbox?${new URLSearchParams({ filtre, ...q })}`;
  const restants = Math.max(0, (etat.quotas.message.plafond.jour ?? 0) - etat.quotas.message.compteur.jour);
  const aujourdhui = fmtCle.format(new Date());
  const resume = ouvert ? conversations.find((x) => x.id === ouvert.id) : undefined;

  return (
    <div className="grid flex-1 lg:h-[calc(100dvh-59px)] lg:grid-cols-[340px_1fr]">
      <aside className="flex min-h-0 flex-col overflow-hidden border-b border-trait lg:border-b-0 lg:border-r">
        <nav className="border-b border-trait px-4" aria-label="Filtres">
          <div className="flex gap-4 overflow-x-auto">
            {FILTRES.map((f) => {
              const actif = f.cle === filtre;
              return (
                <Link
                  key={f.cle}
                  href={`/inbox?filtre=${f.cle}`}
                  aria-current={actif ? "page" : undefined}
                  className={`-mb-px shrink-0 border-b py-4 caption-4 leading-none outline-none transition-[color,border-color] duration-150 focus-visible:text-encre ${actif ? "border-encre text-encre" : "border-transparent text-encre-3 hover:text-encre-2"}`}
                >
                  {f.libelle}
                </Link>
              );
            })}
          </div>
        </nav>
        {conversations.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 p-8 text-center">
            <IconeInbox taille={22} className="text-encre-3" />
            <p className="title-4 text-encre">Rien ici</p>
            <p className="caption-5 text-encre-3">Aucune conversation pour ce filtre.</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((c) => {
              const actif = c.id === ouvert?.id;
              return (
                <li key={c.id} className="border-b border-trait last:border-0">
                  <Link
                    href={lien({ conversation: c.id })}
                    scroll={false}
                    aria-current={actif ? "true" : undefined}
                    className={`relative flex gap-3 px-4 py-3 outline-none transition-colors duration-150 focus-visible:bg-accent-doux ${actif ? "bg-accent-doux" : "hover:bg-creux"}`}
                  >
                    <Avatar nom={c.nom} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate ${c.nonLu ? "title-4 text-encre" : "body-6 text-encre"}`}>{c.nom}</span>
                        {c.dernierMessageAt && (
                          <time className={`shrink-0 caption-5 tabular-nums ${c.nonLu ? "text-accent" : "text-encre-3"}`}>{quand(c.dernierMessageAt, aujourdhui)}</time>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`truncate caption-5 ${c.nonLu ? "text-encre-2" : "text-encre-3"}`}>
                          {c.dernierSens === "sortant" ? "Vous : " : ""}
                          {c.apercu}
                        </span>
                        {c.nonLu && <span className="ml-auto size-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                      </span>
                      {!c.prospectId && <span className="mt-1 self-start tag ton-ambre h-5 px-1.5">Hors CRM</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="flex min-h-[60vh] flex-col overflow-hidden lg:min-h-0">
        {ouvert ? (
          <>
            <MarquerLue id={ouvert.id} nonLu={ouvert.nonLu} />
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-trait px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar nom={ouvert.nom} taille={32} />
                <div className="min-w-0">
                  <h2 className="truncate title-3 text-encre">{ouvert.nom}</h2>
                  {ouvert.sousTitre && <p className="truncate caption-5 text-encre-3">{ouvert.sousTitre}</p>}
                </div>
              </div>
              {ouvert.prospectId ? (
                <span className="flex items-center gap-3">
                  {resume?.etape && <BadgeEtape libelle={libelleEtape.get(resume.etape) ?? resume.etape} />}
                  <Link href={`/?prospect=${ouvert.prospectId}`} className="bouton bouton-contour px-3 py-1.5 caption-3">
                    Voir la fiche
                  </Link>
                </span>
              ) : (
                <span className="tag ton-ambre">Hors CRM · ajout au CRM en phase 2</span>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <FilMessages messages={ouvert.messages} nom={ouvert.nom} />
            </div>
            <footer className="border-t border-trait px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl bg-creux p-2 ring-1 ring-trait">
                <textarea
                  disabled
                  rows={2}
                  aria-label="Message"
                  placeholder="L'envoi arrive en phase 2 : chaque message rejoindra la file d'attente, sous quota."
                  className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 body-6 text-encre-3 outline-none placeholder:text-encre-3"
                />
                <button type="button" disabled className="bouton bouton-plein size-9 p-0" aria-label="Envoyer (phase 2)">
                  <IconeEnvoyer taille={16} />
                </button>
              </div>
              <p className="mt-2 px-1 caption-5 text-encre-3">
                {restants} message{restants > 1 ? "s" : ""} restant{restants > 1 ? "s" : ""} aujourd&apos;hui
              </p>
            </footer>
          </>
        ) : (
          <EtatVide icone={<IconeMessage taille={22} />} titre="Aucune conversation ouverte" texte="Choisis une conversation dans la liste." />
        )}
      </div>
    </div>
  );
}
