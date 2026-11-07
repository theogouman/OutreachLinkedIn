import { Suspense } from "react";
import Link from "next/link";
import { BadgeEtape } from "@/components/badges";
import { FilMessages } from "@/components/fil-messages";
import { etatOutil, fil, filtreInboxSchema, inbox, referentiels, type FiltreInbox } from "@/server/donnees";
import { MarquerLue } from "./marquer-lue";

const FILTRES: { cle: FiltreInbox; libelle: string }[] = [
  { cle: "tous", libelle: "Toutes" },
  { cle: "non_lus", libelle: "Non lues" },
  { cle: "a_traiter", libelle: "Réponses à traiter" },
  { cle: "hors_crm", libelle: "Hors CRM" },
];

const fmtCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export default function PageInbox({ searchParams }: PageProps<"/inbox">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <Contenu searchParams={searchParams} />
      </Suspense>
    </section>
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

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[22rem_1fr]">
      <aside className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
        <nav className="flex flex-wrap gap-1 border-b border-neutral-200 p-2 text-xs" aria-label="Filtres">
          {FILTRES.map((f) => (
            <Link
              key={f.cle}
              href={`/inbox?filtre=${f.cle}`}
              aria-current={f.cle === filtre ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1.5 ${f.cle === filtre ? "bg-[#e0625a]/10 font-medium text-[#b5443d]" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {f.libelle}
            </Link>
          ))}
        </nav>
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">Aucune conversation.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={lien({ conversation: c.id })}
                  scroll={false}
                  className={`flex flex-col gap-0.5 px-4 py-3 hover:bg-[#f5f2f2]/70 ${c.id === ouvert?.id ? "bg-[#f5f2f2]" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${c.nonLu ? "font-semibold text-neutral-900" : "text-neutral-800"}`}>
                      {c.nonLu && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#e0625a]" aria-label="Non lue" />}
                      {c.nom}
                    </span>
                    {c.dernierMessageAt && (
                      <time className="shrink-0 text-[11px] text-neutral-500">{fmtCourt.format(new Date(c.dernierMessageAt))}</time>
                    )}
                  </span>
                  <span className="truncate text-xs text-neutral-500">
                    {c.dernierSens === "sortant" ? "Vous : " : ""}
                    {c.apercu}
                  </span>
                  {!c.prospectId && <span className="text-[11px] text-amber-700">Hors CRM</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
        {ouvert ? (
          <>
            <MarquerLue id={ouvert.id} nonLu={ouvert.nonLu} />
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{ouvert.nom}</h2>
                {ouvert.sousTitre && <p className="truncate text-sm text-neutral-500">{ouvert.sousTitre}</p>}
              </div>
              {ouvert.prospectId ? (
                <span className="flex items-center gap-3">
                  {(() => {
                    const c = conversations.find((x) => x.id === ouvert.id);
                    return c?.etape ? <BadgeEtape libelle={libelleEtape.get(c.etape) ?? c.etape} /> : null;
                  })()}
                  <Link href={`/?prospect=${ouvert.prospectId}`} className="text-sm text-[#b5443d] hover:underline">
                    Voir la fiche
                  </Link>
                </span>
              ) : (
                <span className="text-xs text-amber-700">Hors CRM · ajout au CRM en phase 2</span>
              )}
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <FilMessages messages={ouvert.messages} nom={ouvert.nom} />
            </div>
            <footer className="border-t border-neutral-200 px-5 py-3">
              <textarea
                disabled
                rows={2}
                placeholder="L'envoi de messages arrive en phase 2 : chaque message rejoindra la file d'attente, sous quota."
                className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              />
              <p className="mt-1 text-xs text-neutral-500">{restants} message{restants > 1 ? "s" : ""} restant{restants > 1 ? "s" : ""} aujourd&apos;hui</p>
            </footer>
          </>
        ) : (
          <p className="m-auto p-8 text-sm text-neutral-500">Sélectionne une conversation.</p>
        )}
      </div>
    </div>
  );
}
