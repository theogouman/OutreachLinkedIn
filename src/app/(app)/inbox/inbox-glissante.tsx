"use client";

/*
 * Inbox sur téléphone et tablette (< 1024 px) : liste et conversation vivent dans UN seul
 * composant, deux volets enchaînés par la transition Transitions.dev « Page side-by-side »
 * (la liste sort vers la gauche, la conversation arrive de la droite, en fondu et flou).
 * À l'ouverture d'une conversation, l'encoche recherche + filtres se dissout comme du verre
 * dépoli (flou, fondu, léger retrait) ; un bouton retour ramène à la liste, filtres conservés.
 * Sur grand écran, les deux volets restent côte à côte (grille), sans animation.
 */

import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PETIT_ECRAN = "(max-width: 1023px)";

const Contexte = createContext<{ retourListe: () => void } | null>(null);

/** Bouton « retour à la liste » de l'en-tête de conversation (petits écrans uniquement). */
export function RetourListe() {
  const c = useContext(Contexte);
  if (!c) return null;
  return (
    <button
      type="button"
      onClick={c.retourListe}
      aria-label="Retour aux conversations"
      className="-ml-1 grid size-9 shrink-0 place-items-center rounded-full text-encre-2 outline-none transition-colors duration-150 hover:bg-creux hover:text-encre focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
    >
      <svg viewBox="0 0 256 256" className="size-[18px]" fill="currentColor" aria-hidden>
        <path d="M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z" />
      </svg>
    </button>
  );
}

export function InboxGlissante({
  liste,
  conversation,
  idOuverte,
  ouverteExplicitement,
}: {
  liste: ReactNode;
  conversation: ReactNode;
  /** Conversation affichée par le serveur. */
  idOuverte: string | null;
  /** Ouverte par l'URL (?conversation=) : sur téléphone, on montre alors la conversation. */
  ouverteExplicitement: boolean;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [vue, setVue] = useState<"liste" | "conversation">(ouverteExplicitement ? "conversation" : "liste");
  // Conversation demandée au clic, en attendant la réponse du serveur.
  const [demandee, setDemandee] = useState<string | null>(null);

  // L'URL fait foi (retour arrière du navigateur, lien direct) : ajusté pendant le rendu.
  const etatUrl = `${ouverteExplicitement}:${idOuverte}`;
  const [etatUrlVu, setEtatUrlVu] = useState(etatUrl);
  if (etatUrlVu !== etatUrl) {
    setEtatUrlVu(etatUrl);
    setVue(ouverteExplicitement ? "conversation" : "liste");
  }

  const enChargement = demandee !== null && demandee !== idOuverte;

  const clicListe = (e: MouseEvent) => {
    const lien = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-conversation]");
    if (!lien || !window.matchMedia(PETIT_ECRAN).matches) return;
    // Glisse tout de suite ; le contenu arrive avec la navigation.
    setDemandee(lien.dataset.conversation ?? null);
    setVue("conversation");
  };

  const retourListe = () => {
    setVue("liste");
    setDemandee(null);
    const q = new URLSearchParams(params);
    q.delete("conversation");
    q.delete("prospect");
    q.delete("onglet");
    q.delete("interlocuteur");
    router.replace(q.size ? `${chemin}?${q}` : chemin, { scroll: false });
  };

  return (
    <Contexte value={{ retourListe }}>
      <div className="inbox-glisse" data-vue={vue}>
        <div className="inbox-volet" data-position={vue === "liste" ? "actif" : "avant"} onClickCapture={clicListe}>
          {liste}
        </div>
        <div className="inbox-volet" data-position={vue === "conversation" ? "actif" : "apres"}>
          {conversation}
          {enChargement && (
            <div className="carte absolute inset-0 flex flex-col gap-4 p-5 lg:hidden" aria-busy="true" aria-label="Chargement de la conversation">
              <div className="flex items-center gap-3">
                <span className="squelette size-10 rounded-full" />
                <span className="squelette h-4 w-40" />
              </div>
              <span className="squelette h-12 w-2/3 rounded-2xl" />
              <span className="squelette ml-auto h-12 w-1/2 rounded-2xl" />
              <span className="squelette h-12 w-3/5 rounded-2xl" />
            </div>
          )}
        </div>
      </div>
    </Contexte>
  );
}
