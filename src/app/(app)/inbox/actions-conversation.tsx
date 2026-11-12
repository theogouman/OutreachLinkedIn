"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionMarquerNonLue, actionSupprimerConversation } from "@/app/actions";
import { IconeEnveloppe } from "@/components/icones";
import { IconeCorbeille } from "@/components/icones-pages";
import { useRetour } from "@/components/interface/toasts";

const BOUTON =
  "grid size-9 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";

/** En-tête de la conversation ouverte : la remettre en non lue, ou la supprimer de l'outil. */
export function ActionsConversation({ id, nonLu, nom }: { id: string; nonLu: boolean; nom: string }) {
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const router = useRouter();
  const annuler = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmer) annuler.current?.focus();
  }, [confirmer]);

  return (
    <div className="relative flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        disabled={enCours || nonLu}
        onClick={() => demarrer(async () => retourner(await actionMarquerNonLue(id)))}
        aria-label="Marquer comme non lue"
        title={nonLu ? "Déjà non lue" : "Marquer comme non lue"}
        className={`${BOUTON} hover:bg-creux hover:text-encre`}
      >
        <IconeEnveloppe taille={16} />
      </button>
      <button
        type="button"
        onClick={() => setConfirmer((v) => !v)}
        aria-expanded={confirmer}
        aria-label="Supprimer la conversation"
        title="Supprimer la conversation"
        className={`${BOUTON} hover:bg-accent-doux hover:text-rouge aria-expanded:bg-accent-doux aria-expanded:text-rouge`}
      >
        <IconeCorbeille taille={16} />
      </button>
      {confirmer && (
        <div
          role="alertdialog"
          aria-label="Confirmer la suppression"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setConfirmer(false);
            }
          }}
          className="flottant absolute right-0 top-11 z-10 flex w-[280px] animate-apparition flex-col gap-3 rounded-[18px] p-4"
        >
          <p className="body-6 text-encre">Supprimer la conversation avec {nom} ?</p>
          <p className="caption-5 text-encre-3">
            Elle disparaît de l&apos;outil avec ses messages, rien n&apos;est supprimé sur LinkedIn. La fiche prospect est conservée. Un
            nouveau message la fera réapparaître
          </p>
          <div className="flex justify-end gap-2">
            <button ref={annuler} type="button" onClick={() => setConfirmer(false)} className="bouton bouton-discret px-3 py-1.5 caption-3">
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                demarrer(async () => {
                  const r = await actionSupprimerConversation(id);
                  retourner(r);
                  setConfirmer(false);
                  if (r.ok) router.replace("/inbox", { scroll: false });
                })
              }
              className="bouton bouton-plein px-3 py-1.5 caption-3"
            >
              {enCours ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
