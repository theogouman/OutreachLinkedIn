"use client";

/*
 * Squelette de l'Inbox, affiché pendant le chargement (et à chaque changement de conversation) :
 * même conteneur que l'Inbox réelle (.inbox-glisse, donc même hauteur à tout écran) et mêmes
 * zones (encoche, lignes ; en-tête, fil, rédaction), pour que le contenu arrive à sa place sans
 * saut. Sur téléphone, le volet montré suit l'URL : la conversation si ?conversation= est présent,
 * la liste sinon (lu sur location, sans attendre le serveur).
 */

import { useSyncExternalStore } from "react";

function abonner(rappel: () => void) {
  window.addEventListener("popstate", rappel);
  return () => window.removeEventListener("popstate", rappel);
}
const conversationDansUrl = () => new URLSearchParams(window.location.search).has("conversation");

/** Volets posés sans transition : le squelette apparaît déjà à sa place. */
const SANS_ANIMATION = { transition: "none" } as const;

export function SqueletteInbox() {
  const conversation = useSyncExternalStore(abonner, conversationDansUrl, () => false);
  return (
    <div className="inbox-glisse" aria-busy="true" aria-label="Chargement des conversations">
      <div className="inbox-volet" data-position={conversation ? "avant" : "actif"} style={SANS_ANIMATION}>
        <div className="carte flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-trait p-2">
            <span className="squelette block h-10 rounded-[18px]" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-trait px-4 py-3">
                <span className="squelette size-10 shrink-0 rounded-full" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="squelette h-3 w-32" />
                  <span className="squelette h-3 w-48 max-w-full" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="inbox-volet" data-position={conversation ? "actif" : "apres"} style={SANS_ANIMATION}>
        <SqueletteConversation />
      </div>
    </div>
  );
}

/** Conversation en chargement : en-tête, fil, rédaction (aussi au clic sur une conversation). */
export function SqueletteConversation({ className = "" }: { className?: string }) {
  return (
    <div className={`carte flex min-h-0 flex-col overflow-hidden ${className}`} aria-busy="true" aria-label="Chargement de la conversation">
      <div className="flex items-center gap-3 border-b border-trait px-4 py-3 sm:px-5">
        <span className="squelette size-10 shrink-0 rounded-full" />
        <span className="flex flex-col gap-2">
          <span className="squelette h-4 w-40" />
          <span className="squelette h-3 w-56 max-w-full" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-5 py-5">
        <span className="squelette h-12 w-2/3 rounded-2xl" />
        <span className="squelette ml-auto h-12 w-1/2 rounded-2xl" />
        <span className="squelette h-16 w-3/5 rounded-2xl" />
        <span className="squelette ml-auto h-10 w-2/5 rounded-2xl" />
      </div>
      <div className="border-t border-trait px-4 py-3">
        <span className="squelette block h-[52px] rounded-2xl" />
        <span className="squelette mt-2 block h-3 w-56 max-w-full" />
      </div>
    </div>
  );
}
