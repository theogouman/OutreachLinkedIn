"use client";

import { useTransition } from "react";
import { actionAnnulerTache, actionTrancher } from "@/app/actions";
import { useRetour } from "@/components/interface/toasts";
import { IconeFermer } from "@/components/icones";

export function ActionsTache({ id, statut }: { id: string; statut: string }) {
  const [enCours, demarrer] = useTransition();
  const retourner = useRetour();
  const petit = "bouton px-2.5 py-1 caption-3";

  return (
    <>
      {statut === "en_attente" && (
        // Téléphone : petite croix (libellé pour les lecteurs d'écran) ; plus large : « Annuler ».
        <button
          type="button"
          disabled={enCours}
          aria-label="Annuler cette action"
          title="Annuler cette action"
          className="grid size-8 shrink-0 place-items-center rounded-full text-encre-3 outline-none transition-colors duration-150 hover:bg-encre/[0.05] hover:text-encre focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 sm:w-auto sm:px-3 sm:caption-3"
          onClick={() => demarrer(async () => retourner(await actionAnnulerTache(id)))}
        >
          <IconeFermer taille={14} className="sm:hidden" />
          <span className="hidden sm:inline" aria-hidden>
            Annuler
          </span>
        </button>
      )}
      {statut === "incertaine" && (
        // Décision à prendre : boutons sur une ligne à part, sous l'action.
        <div className="flex basis-full flex-wrap gap-2 pl-12 sm:basis-auto sm:pl-0">
          <button
            type="button"
            disabled={enCours}
            title="L'action est bien partie (vérifié sur LinkedIn)"
            className={`${petit} bg-emerald-700 text-white hover:bg-emerald-800`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "faite")))}
          >
            C&apos;est parti
          </button>
          <button
            type="button"
            disabled={enCours}
            title="L'action n'est pas partie : la renvoyer (risque de doublon si elle était partie)"
            className={`${petit} bouton-contour`}
            onClick={() => {
              if (window.confirm("Renvoyer cette action ? Si elle était déjà partie, le prospect la recevra deux fois.")) {
                demarrer(async () => retourner(await actionTrancher(id, "remettre")));
              }
            }}
          >
            Renvoyer
          </button>
          <button
            type="button"
            disabled={enCours}
            className={`${petit} bouton-discret`}
            onClick={() => demarrer(async () => retourner(await actionTrancher(id, "abandonner")))}
          >
            Abandonner
          </button>
        </div>
      )}
    </>
  );
}
